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
  async list () {
    throw new Error('Not implemented: must be overidden')
  }

  async get (podId) {
    const pods = await this.list()
    if (pods.has(podId)) return pods.get(podId)
    else return null
  }

  async resolve (podId) {
    const pod = await this.get(podId)
    if (pod.ip && pod.port) {
      return `http://${pod.ip}:${pod.port}`
    } else if (pod.status === 'Pending') {
      throw new Error('Pod not ready yet')
    } else {
      throw new Error('Pod failiure?')
    }
  }

  /**
   * Spawn a new pod
   */
  async spawn (environId, pool, reason) {
    throw new Error('Not implemented: must be overidden')
  }

  /**
   * Acquire a pod from the cluster
   */
  async acquire (environId) {
    throw new Error('Not implemented: must be overidden')
  }

  /**
   * Fill standby pools to the desired number of pods
   */
  async fill () {
    try {
      const pods = await this.list()
      pino.info({ subject: 'filling', desired: STANDBY_POOL, actual: pods.size })
      const required = STANDBY_POOL - pods.size
      for (let index = 0; index < required; index++) {
        this.spawn(this.environDefault, 'standby', 'filling')
      }
    } catch (err) {
      pino.error({ subject: 'filling', msg: err.message })
    }
    setTimeout(() => this.fill(), STANDBY_FREQ)
  }

  /**
   * Clean the cluster by removing pods that have terminated
   */
  async clean () {
    throw new Error('Not implemented: must be overidden')
  }
}

module.exports = Cluster
