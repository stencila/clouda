const crypto = require('crypto')
const Docker = require('dockerode')
const kubernetes = require('kubernetes-client')
const pino = require('pino')()
const randomPort = require('random-port')
const request = require('retry-request')

const version = require('./package.json').version
const HostHttpServer = require('./HostHttpServer')
const KubernetesState = require('./KubernetesState')
const kubernetesState = new KubernetesState()

// Configuration settings
const STENCILA_IMAGE = process.env.STENCILA_IMAGE || 'stencila/core'
const POD_TIMEOUT = 3600 // seconds
const STANDBY_POOL = 10 // target number of containers in the standby pool
const STANDBY_FREQ = 30000 // fill the standby pool every x milliseconds
const CLEANUP_FREQ = 120000 // cleanup terminated pods every x milliseconds

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
  constructor () {
    this._id = `cloud-${crypto.randomBytes(24).toString('hex')}`
  }

  /**
   * Acquire a pod from the standby pool
   */
  acquire (cb) {
    if (process.env.NODE_ENV === 'development') {
      // During development, get a running container with label `pool=standby`
      // Launch these manually:
      //   docker run --label pool=standby -d -p 2010:2000 stencila/alpha
      // At time of writing it was not possible to update the label (e.g. to
      // remove it from the pool https://github.com/moby/moby/issues/21721#issuecomment-299577702)
      // So you have to stop them manually as well.
      docker.listContainers({
        'limit': 1,
        'filters': '{"status": ["running"], "label": ["pool=standby"]}'
      }, function (err, containers) {
        if (err) return cb(err)

        if (containers.length === 0) cb(null, null)
        else {
          let container = containers[0]
          let port = container.Ports[0]
          pino.info({ pod: container.Id }, 'acquired')

          cb(null, container.Id)
        }
      })
    } else {
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
                  acquirer: this._id
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
  }

  /**
   * Spawn a new pod
   *
   * This will only be used if no standy by pods are available
   */
  spawn (pool, reason, cb) {
    const cmd = ['stencila-cmd']
    const args = ['"0.0.0.0"', '2000', 'false', POD_TIMEOUT.toString()]

    if (process.env.NODE_ENV === 'development') {
      // During development use Docker to emulate a peer pod by running
      // a new container
      randomPort((port) => {
        const options = {
          Image: STENCILA_IMAGE,
          Labels: { pool: pool },
          Cmd: cmd.concat(args),
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

          pino.info({
            pod: container.id,
            port: port
          }, 'created')
          container.start((err) => {
            if (err) return cb(err)

            pino.info({
              pod: container.id,
              port: port
            }, 'started')
            cb(null, container.id)
          })
        })
      })
    } else {
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
                memory: '500Mi',
                cpu: '50m'
              },
              limits: {
                memory: '1.2Gi',
                cpu: '1000m'
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
  }

  fill () {
    // Determine the number of pods in the `standby` pool which are not terminated
    if (process.env.NODE_ENV === 'development') {
      docker.listContainers({
        'filters': '{"status": ["running"], "label": ["pool=standby"]}'
      }, (err, containers) => {
        if (err) return fill(err)

        fill(null, containers.length)
      })
    } else {
      k8s.ns.pods.get({ qs: { labelSelector: 'pool=standby' } }, (err, pods) => {
        if (err) return fill(err)

        let count = 0
        for (let pod of pods.items) {
          if (['Running', 'Pending', 'ContainerCreating'].indexOf(pod.status.phase) > -1) count += 1
        }
        fill(null, count)
      })
    }
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

  /**
   * Cleanup pods that have terminated
   *
   * Note that these are not deleted by Kubernetes by default so will show up in places
   * like the dashboard.
   */
  cleanup () {
    if (process.env.NODE_ENV === 'development') {
      pino.warn('Host.cleanup not implemented in development mode')
    } else {
      k8s.ns.pods.get((err, pods) => {
        if (err) return pino.error(err.message, 'cleanup')

        let count = 0
        for (let pod of pods.items) {
          if (['Succeeded', 'Failed'].indexOf(pod.status.phase) > -1) {
            count += 1
            k8s.ns.pods.delete({ name: pod.metadata.name }, (err, pod) => {
              if (err) return pino.error(err.message, 'cleanup')

              pino.info({ pod: pod.metadata.name }, 'deleted')
            })
          }
        }
        pino.info({ count: count }, 'deleted_pods')

        setTimeout(() => this.cleanup(), CLEANUP_FREQ)
      })
    }
  }

  lookupUrl (pod, cb) {
    kubernetesState.getPod(pod, (err, podState) => {
      if (err) return cb(err);

      if (podState.status === "Pending") {
        // The nodes are full and the pod is waiting
        cb(new Error("Pod not ready yet"))
      }
      else {
        cb(null, `http://${podState.ip}:${podState.port}`)
      }
    })
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
        this.demand((err, pod) => {
          if (err) return cb(err)

          session.pod = pod
          cb(null, pod)
        })
      })((err, pod) => {
        if (err) return cb(err)

        this.lookupUrl(session.pod, (err, url) => {
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

  open (address, session, cb) {
    // Temporarily just echos back the session
    cb(null, {
      address,
      session
    }, session)
  }

  post (type, body, session, cb) {
    if (!session.pod) return cb(new Error('Session has not been initialised yet'))

    this.lookupUrl(session.pod, (err, url) => {
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

  put (address, method, body, session, cb) {
    if (!session.pod) return cb(new Error('Session has not been initialised yet'))

    this.lookupUrl(session.pod, (err, url) => {
      if (err) return cb(err)
      
      request({
        method: 'PUT',
        uri: url + '/' + address + '!' + method,
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

    this.fill()
    this.cleanup()
  }
}

module.exports = Host
