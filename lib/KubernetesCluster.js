const crypto = require('crypto')
const kubernetes = require('kubernetes-client')
const pino = require('pino')

const Cluster = require('./Cluster')

class KubernetesCluster extends Cluster {
  constructor () {
    super()

    this._k8s = new kubernetes.Core({
      url: 'http://127.0.0.1:8000'
    })
    this._pods = this._k8s.ns.pods
  }

  /**
   * List the pods in the cluster
   */
  list (cb) {
    //if (this.cachedAt === null || (new Date() - this.cachedAt) > EXPIRE_KUBERNETES_STATE) {
    //  this.getNow(cb)
    //} else {
    //  cb(null, this.cached)
    //}
    this._pods.get((err, pods) => {
      if (err) return cb(err)

      var result = new Map()
      pods.forEach(pod =>
        result.set(pod.metadata.name, {
          ip: pod.status.podIP,
          port: 2000,
          status: pod.status.phase
        })
      )
      cb(null, result)
    })
  }

  /**
   * Spawn a new pod in the cluster
   */
  spawn (pool, reason, image, cmd, cb) {
    const name = 'stencila-cloud-pod-' + crypto.randomBytes(12).toString('hex')
    const port = 2000
    this._pods.post({ body: {
      kind: 'Pod',
      apiVersion: 'v1',
      metadata: {
        name: name,
        type: 'stencila-cloud-pod',
        labels: {
          pool: pool,
          spawner: this._id,
          reason: reason
        }
      },
      spec: {
        containers: [{
          name: 'stencila-host-container',

          image: image,
          imagePullPolicy: 'IfNotPresent',

          command: cmd[0],
          args: cmd.slice(1),

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
        restartPolicy: 'Never'
      }
    }}, (err, pod) => {
      if (err) return cb(err)

      pino.info({
        pod: pod.metadata.name,
        port: port
      }, 'created')
      const awaitPod = () => {
        this._pods(name).get((err, pod) => {
          if (err) return cb(err)

          if (pod.status.phase === 'Running') {
            pino.info({
              pod: pod.metadata.name,
              port: port
            }, 'started')
            cb(null, pod.metadata.name)
          } else setTimeout(awaitPod, 300)
        })
      }
      awaitPod()
    })
  }

  /**
   * Acquire a pod from the standby pool
   */
  acquire (cb) {
    // In production, get a running container with label `pool=standby`
    this._pods.get({ qs: { fieldSelector: 'status.phase=Running', labelSelector: 'pool=standby' } }, (err, pods) => {
      if (err) return cb(err)

      // No running pods in the standby pool
      if (pods.items.length === 0) return cb(null, null)

      let pod = pods.items[0]
      pino.info({ pod: pod.metadata.name }, 'claiming')

      // Claim this pod
      this._pods(pod.metadata.name).patch({ body: {
        // Mark as claimed
        metadata: {
          labels: {
            pool: 'claimed',
            claimer: this._id
          }
        }
      }}, (err, pod) => {
        if (err) return cb(err)

        pino.info({ pod: pod.metadata.name }, 'acquiring')

        // Check that this host is the claimer of the pod
        const id = pod.metadata.labels.claimer
        if (id === this._id) {
          // This host is the claimer so acquire it
          this._pods(pod.metadata.name).patch({ body: {
            metadata: {
              labels: {
                pool: 'occupied',
                acquirer: this._id,
                acquiredAt: (new Date()).toISOString()
              }
            }
          }}, (err, pod) => {
            if (err) return cb(err)

            pino.info({ pod: pod.metadata.name }, 'acquired')

            cb(null, pod.metadata.name)
          })
        } else {
          // Another host claimed this pod just after this
          // host, so leave it to them and try again
          this.acquire(cb)
        }
      })
    })
  }

  fill () {
    this._pods.get({ qs: { labelSelector: 'pool=standby' } }, (err, pods) => {
      if (err) return fill(err)

      let count = 0
      for (let pod of pods.items) {
        if (['Running', 'Pending', 'ContainerCreating'].indexOf(pod.status.phase) > -1) count += 1
      }
      fill(null, count)
    })
  }

  /**
   * Clean the cluster by removing pods that have terminated
   *
   * Note that these are not deleted by Kubernetes by default so will show up in places
   * like the dashboard.
   */
  clean () {
    this._pods.get({ qs: { labelSelector: 'pool!=deleting' } }, (err, pods) => {
      if (err) return pino.error(err.message, 'cleanup')

      let now = new Date()
      let count = 0
      for (let pod of pods.items) {
        if (['Succeeded', 'Failed'].indexOf(pod.status.phase) > -1) {
          count += 1
          this._pods.delete({ name: pod.metadata.name }, (err, pod) => {
            if (err) return pino.error(err.message, 'cleanup')

            pino.info({ pod: pod.metadata.name }, 'deleted')
          })
        } else if (now - (pod.metadata.labels['acquiredAt'] || now) > POD_LIMIT_OCCUPIED_TIME) {
          count += 1
          // Move to deleting pool so we do not try to delete it multiple times
          this._pods(pod.metadata.name).patch({ body: {
            metadata: {
              labels: {
                pool: 'deleting'
              }
            }
          }}, (err, pod) => {
            if (err) return pino.error(err.message, 'cleanup')

            this._pods.delete({ name: pod.metadata.name, gracePeriodSeconds: POD_GRACE_PERIOD }, (err, pod) => {
              if (err) return pino.error(err.message, 'cleanup')

              pino.info({ pod: pod.metadata.name }, 'deleted (went over time limit)')
            })
          })
        }
      }
      pino.info({ count: count }, 'deleted_pods')

      setTimeout(() => this.clean(), this.cleanFrequency)
    })
  }
}

module.exports = KubernetesCluster
