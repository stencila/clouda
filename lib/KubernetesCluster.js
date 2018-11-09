const crypto = require('crypto')
const kubernetes = require('kubernetes-client')
const pino = require('pino')()

const Cluster = require('./Cluster')

// The kubernetes scheduler ensures that, for each resource type, the sum of the resource requests of the scheduled
// Containers is less than the capacity of the node.
// For the the CPU values m is millicores (1000m is 100% of one CPU core)
const POD_REQUEST_CPU = process.env.POD_REQUEST_MEM || '50m' // As well as limiting pods on the node this is also passed
    // to docker's --cpu-shares controling the relative weighting of containers (since we are setting it to the same value
    // for all containers this probably does nothing).
const POD_REQUEST_MEM = process.env.POD_REQUEST_MEM || '50Mi' // Just used to limit pods on the node.

const POD_LIMIT_CPU = process.env.POD_LIMIT_CPU || '1000m' // Enforced by kubernetes within 100ms intervals
const POD_LIMIT_MEM = process.env.POD_LIMIT_MEM || '1.2Gi' // converted to an integer, and used as the value of the
                                                           // --memory flag in the docker run command
const POD_LIMIT_TIME = process.env.POD_LIMIT_TIME || 1000 * 60 * 1000 // Time in ms
    // that a pod can be occupied before it is terminated automatically
const POD_GRACE_PERIOD = process.env.POD_GRACE_PERIOD || 10 // grace period (in seconds) before the pod is allowed to be forcefully killed

// Inter-pod affinitity for session pods
// A number between 0 and 100
// See https://kubernetes.io/docs/concepts/configuration/assign-pod-node/#inter-pod-affinity-and-anti-affinity-beta-feature
const SESSION_AFFINITY = parseInt(process.env.SESSION_AFFINITY) || 0

const STANDBY_POOL = parseInt(process.env.STANDBY_POOL || 5)

const ENVIRON_DEFAULT = process.env.ENVIRON_DEFAULT || 'stencila/core'


class KubernetesCluster extends Cluster {
  constructor () {
    super()

    let config
    if (process.env.NODE_ENV === 'development') {
      config = kubernetes.config.fromKubeconfig()
    } else {
      config = kubernetes.config.getInCluster()
    }
    this._k8s = new kubernetes.Client({ config })

    this._options = {
      listRefresh: 10000 // milliseconds
    }

    this._list = null
    this._listCachedAt = null
  }

  async init () {
    await this._k8s.loadSpec()
    this._pods = this._k8s.api.v1.namespaces('default').pods
  }

  /**
   * List the pods in the cluster
   */
  async list () {
    if (this._listCachedAt === null || (new Date() - this._listCachedAt) > this._options.listRefresh) {
      const response = await this._pods.get({
        qs: {
          labelSelector: 'type=session'
        }
      })
      const pods = response.body

      let sessions = pods.items.map(pod => this._podToSession(pod))
      sessions.sort((a, b) => {
        if (a.created < b.created) return -1
        else if (a.created > b.created) return 1
        else return 0
      })
      let pendingQueue = 0
      sessions = sessions.map(session => {
        if (session.status === 'pending') {
          session.pendingPosition = pendingQueue
          pendingQueue += 1
        }
        return session
      })
      this._list = new Map(sessions.map(session => [session.id, session]))
      this._listCachedAt = new Date()
    }
    return this._list
  }

  async get (sessionId) {
    const sessions = await this.list()
    if (sessions.has(sessionId)) {
      return sessions.get(sessionId)
    } else {
      const requested = await this._pods(sessionId).get()
      const pod = requested.body
      const session = this._podToSession(pod)
      return session
    }
  }

  /**
   * Spawn a new pod in the cluster
   */
  async spawn (environId, pool, reason) {
    environId = environId || ENVIRON_DEFAULT

    const time = new Date().toISOString().replace(/[-T:.Z]/g, '')
    const rand = crypto.randomBytes(16).toString('hex')
    const name = `session-${time}-${rand}`
    const port = 2000
    const labels = {
      type: 'session',
      pool: pool,
      spawner: this._id,
      reason: reason
    }
    labels[pool + 'At'] = new Date().getTime().toString()
    const container = this.containers[environId]
    const options = {
      kind: 'Pod',
      apiVersion: 'v1',
      metadata: {
        name: name,
        type: 'stencila-cloud-pod',
        labels: labels
      },
      spec: {
        containers: [{
          name: 'stencila-host-container',

          image: container.image,
          imagePullPolicy: container.imagePullPolicy || 'IfNotPresent',

          env: container.vars,

          command: container.cmd && container.cmd.slice(0, 1),
          args: container.cmd && container.cmd.slice(1),

          resources: {
            requests: {
              memory: POD_REQUEST_MEM,
              cpu: POD_REQUEST_CPU
            },
            limits: {
              memory: POD_LIMIT_MEM,
              cpu: POD_LIMIT_CPU
            }
          },

          ports: [{
            containerPort: port
          }]
        }],
        restartPolicy: 'Never',
        securityContext: {
          runAsUser: 1000
        },
        // Do NOT mount any K8s service account tokens into the pod so
        // that session containers can not access the K8s API
        automountServiceAccountToken: false
      }
    }

    // Apply session affinity option
    if (SESSION_AFFINITY) {
      options.spec['affinity'] = {
        podAffinity: {
          preferredDuringSchedulingIgnoredDuringExecution: [{
            weight: SESSION_AFFINITY,
            podAffinityTerm: {
              labelSelector: {
                matchExpressions: [{
                  key: 'type',
                  operator: 'In',
                  values: ['session']
                }]
              },
              topologyKey: 'kubernetes.io/hostname'
            }
          }]
        }
      }
    }

    const response = await this._pods.post({ body: options })
    const pod = response.body
    pino.info({ subject: 'created', pod: pod.metadata.name, port: port })

    return pod.metadata.name
  }

  /**
   * Acquire a pod from the standby pool
   */
  async acquire (environId) {
    const standby = await this._pods.get({
      qs: {
        labelSelector: 'type=session,pool=standby'
      }
    })
    let standbyPods = standby.body.items

    // Only interested in those running or pending (not pods that have succeeded or failed)
    standbyPods = standbyPods.filter(pod => {
      const phase = pod.status.phase
      return phase === 'Running' || phase === 'Pending'
    })

    // No running or pending pods in the standby pool
    if (standbyPods.length === 0) {
      return this.spawn(environId, 'acquired', 'demanded')
    }

    // Sort so that running pods are preferentially selected
    standbyPods = standbyPods.sort((a, b) => {
      if (a.status.phase === 'Running' && b.status.phase === 'Pending') return -1
      else if (b.status.phase === 'Running' && a.status.phase === 'Pending') return 1
      else return 0
    })
    let requestedPod = standbyPods[0]
    pino.info({ subject: 'claiming', pod: requestedPod.metadata.name })

    // Claim this pod
    const claimed = await this._pods(requestedPod.metadata.name).patch({ body: {
      // Mark as claimed
      metadata: {
        labels: {
          pool: 'claimed',
          claimer: this._id
        }
      }
    }})
    const claimedPod = claimed.body
    pino.info({ subject: 'acquiring', pod: claimedPod.metadata.name })

    // Check that this host is the claimer of the pod
    const claimer = claimedPod.metadata.labels.claimer
    if (claimer === this._id) {
      // This host is the claimer so acquire it
      const acquired = await this._pods(claimedPod.metadata.name).patch({ body: {
        metadata: {
          labels: {
            pool: 'acquired',
            acquirer: this._id,
            acquiredAt: new Date().getTime().toString()
          }
        }
      }})
      const acquiredPod = acquired.body
      pino.info({ subject: 'acquired', pod: acquiredPod.metadata.name })

      return acquiredPod.metadata.name
    } else {
      // Another host claimed this pod just after this
      // host, so leave it to them and try again
      return this.acquire(environId)
    }
  }

  async stop (podId) {
    this._pods(podId).delete({ gracePeriodSeconds: POD_GRACE_PERIOD })
    pino.error({ subject: 'stopped', pod: podId })
  }

  async fill () {
    const response = await this._pods.get({
      qs: {
        labelSelector: 'type=session,pool=standby'
      }
    })
    const pods = response.body

    let actual = 0
    for (let pod of pods.items) {
      if (['Running', 'Pending', 'ContainerCreating'].indexOf(pod.status.phase) > -1) actual += 1
    }

    const required = STANDBY_POOL - actual
    for (let index = 0; index < required; index++) {
      this.spawn(ENVIRON_DEFAULT, 'standby', 'filling')
    }
    pino.info({ subject: 'filling', desired: STANDBY_POOL, actual: actual, created: required })
  }

  /**
   * Clean the cluster by removing pods that have terminated
   *
   * Note that these are not deleted by Kubernetes by default so will show up in places
   * like the dashboard.
   */
  async clean () {
    const response = await this._pods.get({
      qs: {
        labelSelector: 'type=session,pool!=deleting'
      }
    })
    const pods = response.body

    let now = new Date()
    let deleted = 0
    for (let pod of pods.items) {
      if (['Succeeded', 'Failed'].indexOf(pod.status.phase) > -1) {
        this._pods(pod.metadata.name).delete()
        pino.info({ subject: 'deleted:finished', pod: pod.metadata.name })
        deleted += 1
      } else if (pod.metadata.labels['acquiredAt']) {
        const acquiredAt = new Date(parseInt(pod.metadata.labels['acquiredAt']))
        if ((now - acquiredAt) > POD_LIMIT_TIME) {
          // Move to deleting pool so we do not try to delete it multiple times
          const patched = await this._pods(pod.metadata.name).patch({ body: {
            metadata: {
              labels: {
                pool: 'deleting'
              }
            }
          }})
          const patchedPod = patched.body

          this._pods(patchedPod.metadata.name).delete({ gracePeriodSeconds: POD_GRACE_PERIOD })
          pino.info({ subject: 'deleted:timeout', pod: patchedPod.metadata.name })
          deleted += 1
        }
      }
    }
    pino.info({ subject: 'cleaned', count: pods.items.length, deleted: deleted })
  }

  /**
   * Transform a Kubernetes pod description into
   * a session description
   *
   * @param  {Object} pod Kubernetes pod description
   * @return {Object}     Session description
   */
  _podToSession (pod) {
    return {
      id: pod.metadata.name,
      ip: pod.status.podIP,
      port: 2000,
      created: pod.metadata.creationTimestamp,
      status: pod.status.phase.toLowerCase()
    }
  }
}

module.exports = KubernetesCluster
