const kubernetes = require('kubernetes-client')
const k8s = new kubernetes.Core({
  url: 'http://127.0.0.1:8000'
})

const Cluster = require('./Cluster')

const CLEANUP_FREQ = process.env.CLEANUP_FREQ || 120000 // cleanup terminated pods every x milliseconds

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

class KubernetesCluster extends Cluster {

  list (cb) {
    k8s.ns.pods.get((err, pods) => {
      if (err) return cb(err)

      var result = new Map()
      pods.forEach(pod =>
        result.set(pod.metadata.name, {
          ip: pod.status.podIP,
          port: 2000,
          status: pod.status.phase
        })
      )
      this.cached = result
      this.cachedAt = new Date()
      cb(null, result)
    })
  }

  /**
   * Acquire a pod from the standby pool
   */
  acquire (cb) {
    // In production, get a running container with label `pool=standby`
    k8s.ns.pods.get({ qs: { fieldSelector: 'status.phase=Running', labelSelector: 'pool=standby' } }, (err, pods) => {
      if (err) return cb(err)

      // No running pods in the standby pool
      if (pods.items.length === 0) return cb(null, null)

      let pod = pods.items[0]
      pino.info({ pod: pod.metadata.name }, 'claiming')

      // Claim this pod
      k8s.ns.pods(pod.metadata.name).patch({ body: {
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
          k8s.ns.pods(pod.metadata.name).patch({ body: {
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

  /**
   * Spawn a new pod
   */
  spawn (pool, reason, image, cmd, cb) {
    // In production, use Kubernetes to create a new peer pod
    const name = 'stencila-cloud-peer-' + crypto.randomBytes(12).toString('hex')
    const port = 2000
    k8s.ns.pods.post({ body: {
      kind: 'Pod',
      apiVersion: 'v1',
      metadata: {
        name: name,
        type: 'stencila-cloud-peer',
        labels: {
          pool: pool,
          spawner: this._id,
          reason: reason
        }
      },
      spec: {
        containers: [{
          name: 'stencila-container',

          image: STENCILA_IMAGE,
          imagePullPolicy: 'IfNotPresent',

          command: cmd,
          args: args,

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

      pino.info({ pod: pod.metadata.name }, 'created')
      const awaitPod = function () {
        k8s.ns.pods(name).get((err, pod) => {
          if (err) return cb(err)

          if (pod.status.phase === 'Running') {
            pino.info({ pod: pod.metadata.name }, 'started')
            cb(null, pod.metadata.name)
          } else setTimeout(awaitPod, 300)
        })
      }
      awaitPod()
    })
  }

  fill () {
    k8s.ns.pods.get({ qs: { labelSelector: 'pool=standby' } }, (err, pods) => {
      if (err) return fill(err)

      let count = 0
      for (let pod of pods.items) {
        if (['Running', 'Pending', 'ContainerCreating'].indexOf(pod.status.phase) > -1) count += 1
      }
      fill(null, count)
    })
  }

  /**
   * Cleanup pods that have terminated
   *
   * Note that these are not deleted by Kubernetes by default so will show up in places
   * like the dashboard.
   */
  cleanup () {
    k8s.ns.pods.get({ qs: { labelSelector: 'pool!=deleting' } }, (err, pods) => {
      if (err) return pino.error(err.message, 'cleanup')

      let now = new Date()
      let count = 0
      for (let pod of pods.items) {
        if (['Succeeded', 'Failed'].indexOf(pod.status.phase) > -1) {
          count += 1
          k8s.ns.pods.delete({ name: pod.metadata.name }, (err, pod) => {
            if (err) return pino.error(err.message, 'cleanup')

            pino.info({ pod: pod.metadata.name }, 'deleted')
          })
        } else if (now - (pod.metadata.labels['acquiredAt'] || now) > POD_LIMIT_OCCUPIED_TIME) {
          count += 1
          // Move to deleting pool so we do not try to delete it multiple times
          k8s.ns.pods(pod.metadata.name).patch({ body: {
            metadata: {
              labels: {
                pool: 'deleting'
              }
            }
          }}, (err, pod) => {
            if (err) return pino.error(err.message, 'cleanup')

            k8s.ns.pods.delete({ name: pod.metadata.name, gracePeriodSeconds: POD_GRACE_PERIOD }, (err, pod) => {
              if (err) return pino.error(err.message, 'cleanup')

              pino.info({ pod: pod.metadata.name }, 'deleted (went over time limit)')
            })
          })
        }
      }
      pino.info({ count: count }, 'deleted_pods')

      setTimeout(() => this.cleanup(), CLEANUP_FREQ)
    })
  }
}

module.exports = KubernetesCluster
