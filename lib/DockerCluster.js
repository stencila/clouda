const Docker = require('dockerode')
const pino = require('pino')()
const randomPort = require('random-port')

const Cluster = require('./Cluster')

class DockerCluster extends Cluster {
  constructor () {
    super()

    this._docker = new Docker({
      socketPath: '/var/run/docker.sock'
    })
  }

  /**
   * List the pods in the cluster
   */
  list (cb) {
    this._docker.listContainers({
      'filters': '{"status": ["running"]}'
    }, function (err, containers) {
      if (err) return cb(err)

      var result = new Map()
      containers.forEach(container =>
        result.set(container.Id, {
          id: container.Id,
          ip: container.Ports[0].IP,
          port: container.Ports[0].PublicPort,
          status: 'Running'
        })
      )
      cb(null, result)
    })
  }

  /**
   * Spawn a new pod in the cluster
   */
  spawn (environ, pool, reason, cb) {
    randomPort((port) => {
      const container = this.containers[environ]
      const options = {
        Image: container.image,
        Env: container.vars,
        Cmd: container.cmd,
        Labels: { pool: pool },
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
      this._docker.createContainer(options, (err, container) => {
        if (err) return cb(err)

        pino.info({ pod: container.Id, port: port }, 'created')
        container.start((err) => {
          if (err) return cb(err)

          pino.info({ pod: container.Id, port: port }, 'started')
          cb(null, container.Id)
        })
      })
    })
  }

  /**
   * Acquire a pod from the cluster
   */
  acquire (environ, cb) {
    // During development, get a running container with label `pool=standby`
    // Launch these manually:
    //   docker run --label pool=standby -d -p 2010:2000 stencila/alpha
    // At time of writing it was not possible to update the label (e.g. to
    // remove it from the pool https://github.com/moby/moby/issues/21721#issuecomment-299577702)
    // So you have to stop them manually as well.
    this._docker.listContainers({
      'limit': 1,
      'filters': '{"status": ["running"], "label": ["pool=standby"]}'
    }, function (err, containers) {
      if (err) return cb(err)

      if (containers.length === 0) {
        // No containers available in the standby pool
        // so spawn a new one
        this.spawn(environ, 'occupied', 'demanded', cb)
      } else {
        let container = containers[0]
        pino.info({ pod: container.Id }, 'acquired')

        cb(null, container.Id)
      }
    })
  }

  /**
   * Clean the cluster by removing pods that have terminated
   */
  clean () {
    // Currently not doin anything
  }
}

module.exports = DockerCluster
