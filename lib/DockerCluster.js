const Docker = require('dockerode')
const docker = new Docker({
  socketPath: '/var/run/docker.sock'
})
const pino = require('pino')
const randomPort = require('random-port')

const Cluster = require('./Cluster')

class DockerCluster extends Cluster {
  /**
   * List pods in the cluster
   */
  list (cb) {
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
      cb(null, result)
    })
  }

  /**
   * Spawn a new pod in the cluster
   */
  spawn (pool, reason, image, cmd, cb) {
    // During development use Docker to emulate a peer pod by running
    // a new container
    randomPort((port) => {
      const options = {
        Image: image,
        Labels: { pool: pool },
        Cmd: cmd,
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
  }

  /**
   * Acquire a pod from the standby pool
   */
  acquire (cb) {
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
        pino.info({ pod: container.Id }, 'acquired')

        cb(null, container.Id)
      }
    })
  }

  cleanup () {
  }
}

module.exports = DockerCluster
