const crypto = require('crypto')
const pino = require('pino')()
const request = require('retry-request')

const version = require('../package.json').version
const HostHttpServer = require('./HostHttpServer')

const Cluster = require(process.env.NODE_ENV === 'development' ? './DockerCluster' : './KubernetesCluster')
const cluster = new Cluster()

/**
 * Implements the Stencila Host API using a Kubernetes cluster
 */
class Host {
  constructor () {
    this._id = `cloud-${crypto.randomBytes(24).toString('hex')}`
  }

  manifest (session, cb) {
    if (!session) {
      // If no session then just return a manifest
      cb(null, {
        id: this._id,
        stencila: {
          package: 'cloud',
          version: version
        }
      })
    } else {
      // If a session then use it's existing pod,
      // or spawn a new one
      ((cb) => {
        if (session.pod) {
          return cb(null, session.pod)
        }
        cluster.demand((err, pod) => {
          if (err) return cb(err)

          session.pod = pod
          cb(null, pod)
        })
      })((err, pod) => {
        if (err) return cb(err)

        cluster.lookupUrl(session.pod, (err, url) => {
          if (err) return cb(err)

          request({
            method: 'GET',
            uri: url,
            headers: {
              Accept: 'application/json'
            }
          }, {retries: 9}, (err, resp, body) => {
            cb(err, body, session)
          })
        })
      })
    }
  }

  open (project, session, cb) {
    // Opening a project requires a new pod for it
    this.demand((err, pod) => {
      if (err) return cb(err)

      session.pod = pod
      cluster.lookupUrl(session.pod, (err, url) => {
        if (err) return cb(err)

        request({
          method: 'GET',
          uri: url + '/open/' + project,
          headers: {
            Accept: 'application/json'
          }
        }, {retries: 1}, (err, res, body) => {
          if (err) pino.error(err)

          cb(err, body, session)
        })
      })
    })
  }

  post (type, body, session, cb) {
    if (!session.pod) return cb(new Error('Session has not been initialised yet'))

    cluster.lookupUrl(session.pod, (err, url) => {
      if (err) return cb(err)

      request({
        method: 'POST',
        uri: url + '/' + type,
        headers: {
          Accept: 'application/json'
        },
        body: body
      }, {retries: 9}, (err, res, body) => {
        cb(err, body, session)
      })
    })
  }

  put (instance, method, body, session, cb) {
    if (!session.pod) return cb(new Error('Session has not been initialised yet'))

    cluster.lookupUrl(session.pod, (err, url) => {
      if (err) return cb(err)

      request({
        method: 'PUT',
        uri: url + '/' + instance + '!' + method,
        headers: {
          Accept: 'application/json'
        },
        body: body
      }, (err, res, body) => {
        cb(err, body, session)
      })
    })
  }

  run () {
    const server = new HostHttpServer(this)
    server.start()

    cluster.fill()
    cluster.cleanup()
  }
}

module.exports = Host
