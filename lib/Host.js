const crypto = require('crypto')
const pino = require('pino')()
const request = require('retry-request')

const version = require('../package.json').version
const HostHttpServer = require('./HostHttpServer')

const DockerCluster = require('./DockerCluster')
const KubernetesCluster = require('./KubernetesCluster')

/**
 * Implements the Stencila Host API using a either a Kubernetes cluster (in production)
 * or a Docker 'cluster' (usually during development on a single machine).
 */
class Host {
  constructor () {
    this.id = `cloud-host-${crypto.randomBytes(24).toString('hex')}`

    this.environs = [
      {
        id: 'stencila/base-node'
      }, {
        id: 'stencila/base'
      }
    ]

    this.server = new HostHttpServer(this)

    const Cluster = process.env.NODE_ENV === 'development' ? DockerCluster : KubernetesCluster
    this.cluster = new Cluster()
  }

  manifest (session, cb) {
    cb(null, session, {
      id: this.id,
      stencila: {
        package: 'cloud',
        version: version
      },
      environs: this.environs,
      types: [], // v1 API
      services: [] // v1 API
    })
  }

  launch_environ (session, environ, cb) {
    this.cluster.acquire(environ, (err, pod) => {
      if (err) return cb(err)

      const result = {
        id: pod,
        path: '/proxy/' + pod
      }
      session.pod = pod
      cb(null, session, result)
    })
  }

  inspect_environ (session, cb) {
    if (!session.pod) return cb(new Error('Session has not been initialised yet'))

    this.cluster.get(session.pod, (err, podState) => {
      if (err) return cb(err)

      cb(null, session, podState)
    })
  }

  proxy_environ (session, method, path, body, cb) {
    if (!session.pod) return cb(new Error('Session has not been initialised yet'))

    this.cluster.resolve(session.pod, (err, url) => {
      if (err) return cb(err)

      request({
        method: method,
        uri: url + path,
        headers: {
          Accept: 'application/json'
        },
        body: body
      }, {retries: 1}, (err, res, body) => {
        cb(err, session, body)
      })
    })
  }

  /**
   * Run this Host
   *
   * Starts the server and cluster (fill and clean up tasks)
   */
  run () {
    this.server.start()
    this.cluster.start()
  }
}

module.exports = Host
