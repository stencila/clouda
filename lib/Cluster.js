const pino = require('pino')()

// Configuration settings
// const POD_TIMEOUT = process.env.POD_TIMEOUT || 3600 // seconds
const STANDBY_POOL = process.env.STANDBY_POOL || 10 // target number of containers in the standby pool
const STANDBY_FREQ = process.env.STANDBY_FREQ || 30000 // fill the standby pool every x milliseconds

class Cluster {
  constructor (options = {}) {
    this.environDefault = 'stencila/base-node'

    // A map between environment ids and container options
    this.containers = {
      'stencila/base-node': {
        image: 'stencila/base-node',
        vars: ['STENCILA_AUTH=false'],
        cmd: ['stencila-cmd']
      },
      'alpine': {
        image: 'alpine',
        vars: [],
        cmd: ['sleep', '90']
      }
    }
  }

  async start () {
    // Start the cluster fill and clean tasks
    await this.init()
    this.fill()
    this.clean()
  }

  async init () {

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
