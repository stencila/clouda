const crypto = require('crypto')
const Docker = require('dockerode')
const kubernetes = require('kubernetes-client')
const pino = require('pino')()
const randomPort = require('random-port')
const request = require('retry-request')

const HostHttpServer = require('./HostHttpServer')

// Configuration settings
const STENCILA_IMAGE = process.env.STENCILA_IMAGE || 'stencila/alpha'

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
 */
class Host {
  spawn (cb) {
    if (process.env.NODE_ENV === 'development') {
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

  manifest (session, cb) {
    ((cb) => {
      if (session.pod) cb(null, session.pod)
      else {
        this.spawn((err, pod) => {
          if (err) return cb(err)

          session.pod = pod
          cb(null, pod)
        })
      }
    })((err, pod) => {
      if (err) return cb(err)

      request({
        method: 'GET',
        uri: pod,
        headers: {
          Accept: 'application/json'
        }
      }, {retries: 9}, (err, resp, body) => {
        cb(err, body, session)
      })
    })
  }

  post (type, options, name, session, cb) {
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
      cb(err, body, session)
    })
  }

  put (address, method, args, session, cb) {
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
      cb(err, body, session)
    })
  }

  run () {
    const server = new HostHttpServer(this)
    server.start()
  }
}

module.exports = Host
