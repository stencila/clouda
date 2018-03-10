const Docker = require('dockerode')
const kubernetes = require('kubernetes-client')

// Configuration settings
const EXPIRE_KUBERNETES_STATE = 10000 // milliseconds

// During development, Docker is used to create session containers
const docker = new Docker({
  socketPath: '/var/run/docker.sock'
})

// In production, Kubernetes is used to create session containers
const k8s = new kubernetes.Core({
  url: 'http://127.0.0.1:8000'
})

/**
 * Caches Kubernetes state so that we can use it to determine
 * if a pod is still 'pending'
 */
class Cluster {
  constructor () {
    this.cached = null
    this.cachedAt = null
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
  getNow (cb) {
    if (process.env.NODE_ENV === 'development') {
      docker.listContainers({
        'filters': '{"status": ["running"]}'
      }, function (err, containers) {
        if (err) return cb(err)

        var result = new Map()
        containers.forEach(container =>
          result.set(container.Id, {
            ip: container.Ports[0].IP,
            port: container.Ports[0].PublicPort,
            status: 'Running'
          })
        )
        this.cached = result
        this.cachedAt = new Date()
        cb(null, result)
      })
    } else {
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
  }
}

module.exports = Cluster
