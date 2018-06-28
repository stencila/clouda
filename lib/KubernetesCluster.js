const crypto = require('crypto')
const kubernetes = require('kubernetes-client')
const pino = require('pino')()

const Cluster = require('./Cluster')

const FILL_FREQ = process.env.FILL_FREQ || 30000 // cleanup terminated pods every x milliseconds
const CLEAN_FREQ = process.env.CLEAN_FREQ || 30000 // cleanup terminated pods every x milliseconds

// The kubernetes scheduler ensures that, for each resource type, the sum of the resource requests of the scheduled
// Containers is less than the capacity of the node.
// For the the CPU values m is millicores (1000m is 100% of one CPU core)
const POD_REQUEST_CPU = process.env.POD_REQUEST_MEM || '50m' // As well as limiting pods on the node this is also passed
    // to docker's --cpu-shares controling the relative weighting of containers (since we are setting it to the same value
    // for all containers this probably does nothing).
const POD_REQUEST_MEM = process.env.POD_REQUEST_MEM || '500Mi' // Just used to limit pods on the node.

const POD_LIMIT_CPU = process.env.POD_LIMIT_CPU || '1000m' // Enforced by kubernetes within 100ms intervals
const POD_LIMIT_MEM = process.env.POD_LIMIT_MEM || '1.2Gi' // converted to an integer, and used as the value of the
                                                           // --memory flag in the docker run command
const POD_LIMIT_OCCUPIED_TIME = process.env.POD_LIMIT_OCCUPIED_TIME || 4 * 3600 * 1000 // Time in ms
    // that a pod can be occupied before it is terminated automatically
const POD_GRACE_PERIOD = process.env.POD_GRACE_PERIOD || 10 // grace period (in seconds) before the pod is allowed to be forcefully killed

const POD_TIMEOUT = 3600

const STANDBY_POOL = 30

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
      const response = await this._pods.get()
      const pods = response.body

      var list = new Map()
      for (let pod of pods.items) {
        list.set(pod.metadata.name, {
          ip: pod.status.podIP,
          port: 2000,
          status: pod.status.phase
        })
      }
      this._list = list
      this._listCachedAt = new Date()
    }
    return this._list
  }

  /**
   * Spawn a new pod in the cluster
   */
  async spawn (environId, pool, reason) {
    const name = 'stencila-cloud-' + crypto.randomBytes(12).toString('hex')
    const port = 2000
    const container = this.containers[environId]
    const options = {
      kind: 'Pod',
      apiVersion: 'v1',
      metadata: {
        name: name,
        type: 'stencila-cloud-pod',
        labels: {
          type: 'session',
          pool: pool,
          spawner: this._id,
          reason: reason
        }
      },
      spec: {
        containers: [{
          name: 'stencila-host-container',

          image: container.image,
          imagePullPolicy: container.imagePullPolicy || 'IfNotPresent',

          env: container.vars,

          command: container.cmd.slice(0, 1),
          args: container.cmd.slice(1),

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
    // In production, get a running container with label `pool=standby`
    const available = await this._pods.get({
      qs: {
        fieldSelector: 'status.phase=Running',
        labelSelector: 'pool=standby'
      }
    })
    const availablePods = available.body

    // No running pods in the standby pool
    if (availablePods.items.length === 0) {
      return this.spawn(environId, 'occupied', 'demanded')
    }

    let requestedPod = availablePods.items[0]
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
      const occupied = await this._pods(claimedPod.metadata.name).patch({ body: {
        metadata: {
          labels: {
            pool: 'occupied',
            acquirer: this._id
          }
        }
      }})
      const occupiedPod = occupied.body
      pino.info({ subject: 'acquired', pod: occupiedPod.metadata.name })

      return occupiedPod.metadata.name
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
        labelSelector: 'pool=standby'
      }
    })
    const pods = response.body

    let actual = 0
    for (let pod of pods.items) {
      if (['Running', 'Pending', 'ContainerCreating'].indexOf(pod.status.phase) > -1) actual += 1
    }

    const required = STANDBY_POOL - actual
    for (let index = 0; index < required; index++) {
      this.spawn(this.environDefault, 'standby', 'filling')
    }
    pino.info({ subject: 'filling', desired: STANDBY_POOL, actual: actual, created: required })

    setTimeout(() => this.fill(), FILL_FREQ)
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
        pino.info({ subject: 'deleted', pod: pod.metadata.name })
        deleted += 1
      } else if (now - (pod.metadata.labels['acquiredAt'] || now) > POD_LIMIT_OCCUPIED_TIME) {
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
    pino.info({ subject: 'deleted:pods', count: pods.items.length, deleted: deleted })

    setTimeout(() => this.clean(), CLEAN_FREQ)
  }
}

module.exports = KubernetesCluster
