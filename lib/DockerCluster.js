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
  async list () {
    return new Promise((resolve, reject) => {
      this._docker.listContainers({
        'filters': '{"status": ["running"]}'
      }, function (err, containers) {
        if (err) return reject(err)

        var result = new Map()
        containers.forEach(container =>
          result.set(container.Id, {
            id: container.Id,
            ip: container.Ports[0].IP,
            port: container.Ports[0].PublicPort,
            status: 'Running'
          })
        )
        resolve(result)
      })
    })
  }

  /**
   * Spawn a new pod in the cluster
   */
  async spawn (environId, pool, reason) {
    return new Promise((resolve, reject) => {
      randomPort((port) => {
        const container = this.containers[environId]
        const options = {
          Image: container.image,
          Env: container.vars.map(evar => `${evar.name}=${evar.value}`),
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
          if (err) return reject(err)

          pino.info({ subject: 'created', pod: container.Id, port: port })
          container.start((err) => {
            if (err) return reject(err)

            pino.info({ subject: 'started', pod: container.Id, port: port })
            resolve(container.Id)
          })
        })
      })
    })
  }

  /**
   * Acquire a pod from the cluster
   *
   * During development, get a running container with label `pool=standby`
   * Launch these manually:
   *   docker run --label pool=standby -d -p 2010:2000 stencila/alpha
   * At time of writing it was not possible to update the label (e.g. to
   * remove it from the pool https://github.com/moby/moby/issues/21721#issuecomment-299577702)
   * So you have to stop them manually as well.
   */
  async acquire (environId) {
    return new Promise((resolve, reject) => {
      this._docker.listContainers({
        'limit': 1,
        'filters': '{"status": ["running"], "label": ["pool=standby"]}'
      }, function (err, containers) {
        if (err) return reject(err)

        if (containers.length === 0) {
          return this.spawn(environId, 'occupied', 'demanded')
        }

        let container = containers[0]
        pino.info({ subject: 'acquired', pod: container.Id })
        resolve(container.Id)
      })
    })
  }

  async stop (podId) {
    const container = this._docker.getContainer(podId)
    try {
      await container.stop()
      await container.remove()
    } catch (err) {
      pino.error({ subject: 'stopping', pod: podId, msg: err.message })
    }
  }

  /**
   * Clean the cluster by removing pods that have terminated
   *
   * Currently, does nothing
   */
  clean () {
  }
}

module.exports = DockerCluster
