const pino = require('pino')()

// Configuration settings
const POD_TIMEOUT = process.env.POD_TIMEOUT || 3600 // seconds
const STANDBY_POOL = process.env.STANDBY_POOL || 10 // target number of containers in the standby pool
const STANDBY_FREQ = process.env.STANDBY_FREQ || 30000 // fill the standby pool every x milliseconds

const EXPIRE_KUBERNETES_STATE = 10000 // milliseconds

class Cluster {
  constructor () {
    this.cached = null
    this.cachedAt = null
  }


  /**
   * Spawn a new pod
   */
  spawn (pool, reason, image, cmd, cb) {
    const cmd = ['stencila-cmd']
    const args = ['"0.0.0.0"', '2000', 'false', POD_TIMEOUT.toString()]
  }

  /**
   * Acquire a pod from the standby pool
   */
  acquire (cb) {
    
  }

  fill () {
    const fill = (err, number) => {
      if (err) return pino.error(err.message, 'filling')
      pino.info({desired: STANDBY_POOL, actual: number}, 'filling')

      const required = STANDBY_POOL - number
      if (required > 0) {
        for (let index = 0; index < required; index++) {
          this.spawn('standby', 'filling', (err) => {
            if (err) pino.error(err.message, 'spawning')
          })
        }
      }

      setTimeout(() => this.fill(), STANDBY_FREQ)
    }
  }

  /**
   * Demand a peer pod
   */
  demand (cb) {
    this.acquire((err, pod) => {
      if (err) return cb(err)
      if (pod) return cb(null, pod)

      this.spawn('occupied', 'demanded', (err, pod) => {
        if (err) return cb(err)

        cb(null, pod)
      })
    })
  }

  lookupUrl (pod, cb) {
    this.getPod(pod, (err, podState) => {
      if (err) return cb(err)

      if (podState.status === 'Pending') {
        // The nodes are full and the pod is waiting
        cb(new Error('Pod not ready yet'))
      } else {
        cb(null, `http://${podState.ip}:${podState.port}`)
      }
    })
  }

  getPod (pod, cb) {
    this.get((err, state) => {
      if (err) return cb(err)

      if (state.has(pod)) {
        cb(null, state.get(pod))
      } else {
        this.getNow((err, state) => {
          if (err) return cb(err)

          if (state.has(pod)) {
            cb(null, state.get(pod))
          } else {
            cb(new Error('Pod not found.  Idle timeout or time limit reached.'))
          }
        })
      }
    })
  }

  get (cb) {
    if (this.cachedAt === null || (new Date() - this.cachedAt) > EXPIRE_KUBERNETES_STATE) {
      this.getNow(cb)
    } else {
      cb(null, this.cached)
    }
  }
}

module.exports = Cluster
