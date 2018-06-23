const pino = require('pino')()

// Configuration settings
// const POD_TIMEOUT = process.env.POD_TIMEOUT || 3600 // seconds
const STANDBY_POOL = process.env.STANDBY_POOL || 10 // target number of containers in the standby pool
const STANDBY_FREQ = process.env.STANDBY_FREQ || 30000 // fill the standby pool every x milliseconds

const EXPIRE_KUBERNETES_STATE = 10000 // milliseconds

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

const POD_TIMEOUT = 3600

class Cluster {
  constructor (options = {}) {
    this.environDefault = 'stencila/base-node'

    // A map between environmen ids and container options
    this.containers = {
      'stencila/base-node': {
        image: 'stencila/base-node',
        vars: ['STENCILA_AUTH=false'],
        cmd: ['stencila-cmd']
      }
    }
  }

  start () {
    // Start the cluster fill and clean tasks
    this.fill()
    this.clean()
  }

  /**
   * List the pods in the cluster
   */
  list (cb) {
    throw new Error('Not implemented: must be overidden')
  }

  get (pod, cb) {
    this.list((err, pods) => {
      if (err) return cb(err)

      if (pods.has(pod)) {
        cb(null, pods.get(pod))
      } else {
        cb(null, {})
      }
    })
  }

  resolve (pod, cb) {
    this.get(pod, (err, podState) => {
      if (err) return cb(err)

      if (podState.ip && podState.port) {
        cb(null, `http://${podState.ip}:${podState.port}`)
      } else if (podState.status === 'Pending') {
        // The nodes are full and the pod is waiting
        cb(new Error('Pod not ready yet'))
      } else {
        cb(new Error('Pod failiure?'))
      }
    })
  }

  /**
   * Spawn a new pod
   */
  spawn (environ, pool, reason, cb) {
    throw new Error('Not implemented: must be overidden')
  }

  /**
   * Acquire a pod from the cluster
   */
  acquire (environ, cb) {
    throw new Error('Not implemented: must be overidden')
  }

  /**
   * Fill standby pools to the desired number of pods
   */
  fill () {
    this.list((err, pods) => {
      if (err) return pino.error(err.message, 'filling')

      pino.info({desired: STANDBY_POOL, actual: pods.size}, 'filling')
      const required = STANDBY_POOL - pods.size
      if (required > 0) {
        for (let index = 0; index < required; index++) {
          this.spawn(this.environDefault, 'standby', 'filling', (err) => {
            if (err) pino.error(err.message, 'spawning')
          })
        }
      }
    })
    setTimeout(() => this.fill(), STANDBY_FREQ)
  }

  /**
   * Clean the cluster by removing pods that have terminated
   */
  clean () {
    throw new Error('Not implemented: must be overidden')
  }
}

module.exports = Cluster
