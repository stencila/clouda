const crypto = require('crypto')
const Docker = require('dockerode')
const kubernetes = require('kubernetes-client')
const pino = require('pino')()
const randomPort = require('random-port')
const request = require('retry-request')

const HostHttpServer = require('./HostHttpServer')

// Configuration settings
const NODE_ENV = process.env.NODE_ENV

const STENCILA_IMAGE = process.env.STENCILA_IMAGE || 'stencila/alpha'

var TOKEN_SECRET = process.env.TOKEN_SECRET
if (!TOKEN_SECRET) {
  if (NODE_ENV === 'development') TOKEN_SECRET = 'a super unsecet key'
  else throw Error('TOKEN_SECRET must be set')
}

// During development, Docker is used to create session containers
const docker = new Docker({
  socketPath: '/var/run/docker.sock'
})

// In production, Kubernetes is used to create session containers
const k8s = new kubernetes.Core({
  url: 'http://127.0.0.1:8000'
})

/**
 * Implements the Stencila Host API using a Kubernetes cluster
 *
 * We use signed JSON objects, stored as Base64 encoded cookies on the client,
 * for persisting session state across calls. We do not use the Jason Web Tokens (JWT) for this
 * as they have security vulnerabilities. We do not us Macroons for this as they are focussed
 * on authorizing capabilities instead of storing state.
 */
class Host {
  /**
   * Sign a session
   *
   * Generates a HMAC-SHA256 signature of the session object that is used for verification.
   *
   * @param  {object} session The session object
   * @return {string}         The session signature (a hex digest)
   */
  sign (session) {
    return crypto.createHmac('sha256', TOKEN_SECRET).update(JSON.stringify(session)).digest('hex')
  }

  checkin (token) {
    let session
    if (token) {
      const json = Buffer.from(token, 'base64').toString()
      const object = JSON.parse(json)
      if (object.signature !== this.sign(object.session)) return null
      session = object.session
    } else {
      session = {
        start: new Date()
      }
    }
    return session
  }

  // Checkout a session by creating a token for it
  checkout (session) {
    const object = {
      session: session,
      signature: this.sign(session)
    }
    const json = JSON.stringify(object)
    const token = Buffer.from(json).toString('base64')
    return token
  }

  spawn (cb) {
    if (NODE_ENV === 'development') {
      // During development use Docker to emulate a pod by running
      // a new container
      randomPort((port) => {
        const options = {
          Image: STENCILA_IMAGE,
          ExposedPorts: { '2000/tcp': {} },
          HostConfig: {
            PortBindings: {
              '2000/tcp': [{
                'HostIp': '127.0.0.1',
                'HostPort': port.toString()
              }]
            }
          }
        }
        docker.createContainer(options, (err, container) => {
          if (err) return cb(err)

          pino.info({ pod: container.id }, 'created')
          container.start((err) => {
            if (err) return cb(err)

            pino.info({ pod: container.id }, 'started')
            cb(null, `http://127.0.0.1:${port}`)
          })
        })
      })
    } else {
      // In production, use Kubernetes to create a new pod
      const name = 'pod-' + crypto.randomBytes(24).toString('hex')
      const port = 2000
      k8s.ns.pods.post({ body: {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: {
          name: name
        },
        spec: {
          containers: [{
            name: 'stencila-container',
            image: STENCILA_IMAGE,
            imagePullPolicy: 'IfNotPresent',
            ports: [{
              containerPort: port
            }]
          }]
        }
      }}, (err, pod) => {
        if (err) return cb(err)

        pino.info({ pod: pod.metadata.name }, 'created')
        const awaitPod = function () {
          k8s.ns.pods(name).get((err, pod) => {
            if (err) return cb(err)

            if (pod.status.phase === 'Running') {
              pino.info({ pod: pod.metadata.name }, 'started')
              cb(null, `http://${pod.status.podIP}:${port}`)
            } else setTimeout(awaitPod, 300)
          })
        }
        awaitPod()
      })
    }
  }

  pod (session, cb) {
    if (session.pod) cb(null, session.pod)
    else {
      this.spawn((err, pod) => {
        if (err) return cb(err)

        session.pod = pod
        cb(null, pod)
      })
    }
  }

  manifest (token, cb) {
    var session = this.checkin(token)
    if (!session) session = {}

    // Treat this like a login and remove the session
    // Another option would be to check id the pod is still active and reuseit
    if (session.pod) {
      // TODO: kill the pod if it's still around
      pino.info('removing pod')
      session.pod = null
    }
    this.pod(session, (err, pod) => {
      if (err) return cb(err)

      request({
        method: 'GET',
        uri: pod,
        headers: {
          Accept: 'application/json'
        }
      }, {retries: 9}, (err, resp, body) => {
        const token = this.checkout(session)
        cb(err, body, token)
      })
    })
  }

  post (type, options, name, token, cb) {
    const session = this.checkin(token)
    if (!session) return cb(new Error('Invalid token'))
    if (!session.pod) return cb(new Error('Session has not been initialised yet'))

    request({
      method: 'POST',
      uri: session.pod + '/' + type,
      headers: {
        Accept: 'application/json'
      },
      body: JSON.stringify(options),
      timeout: 10000
    }, {retries: 9}, (err, res, body) => {
      const token = this.checkout(session)
      cb(err, body, token)
    })
  }

  put (address, method, args, token, cb) {
    const session = this.checkin(token)
    if (!session) return cb(new Error('Invalid token'))
    if (!session.pod) return cb(new Error('Session has not been initialised yet'))

    request({
      method: 'PUT',
      uri: session.pod + '/' + address + '!' + method,
      headers: {
        Accept: 'application/json'
      },
      body: args,
      json: true
    }, (err, res, body) => {
      if (err) return cb(err)
      cb(err, body, token)
    })
  }

  run () {
    const server = new HostHttpServer(this)
    server.start()
  }
}

module.exports = Host
