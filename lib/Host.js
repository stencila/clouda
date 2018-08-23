const crypto = require('crypto')
const request = require('retry-request')

const version = require('../package.json').version
const HostHttpServer = require('./HostHttpServer')

const DockerCluster = require('./DockerCluster')
const KubernetesCluster = require('./KubernetesCluster')

var CLUSTER = process.env.CLUSTER
if (!CLUSTER) {
  if (process.env.NODE_ENV === 'development') CLUSTER = 'docker'
  else CLUSTER = 'k8s'
}

/**
 * Implements the Stencila Host API using a either a Kubernetes cluster (in production)
 * or a Docker 'cluster' (usually during development on a single machine).
 */
class Host {
  constructor () {
    this.id = `cloud-host-${crypto.randomBytes(24).toString('hex')}`

    this.environs = [
      {
        id: 'stencila/core',
        name: 'stencila/core',
        version: 'stencila/core'
      }
    ]

    this.server = new HostHttpServer(this)

    const Cluster = CLUSTER === 'docker' ? DockerCluster : KubernetesCluster
    this.cluster = new Cluster()
  }

  /**
   * Get the host's manifest
   *
   * @return {Object} A manifest object
   */
  async manifest () {
    return {
      id: this.id,
      stencila: {
        package: 'cloud',
        version: version
      },
      environs: await this.environList(),
      services: await this.serviceList()
    }
  }

  /**
   * List environments
   *
   * @return {Array[Objects]} An list of environments
   */
  async environList () {
    return this.environs
  }

  /**
   * List sessions
   *
   * @return {Array[String]} An array of session ids
   */
  async sessionList () {
    return []
  }

  /**
   * Create a session
   *
   * @param  {String} environId Environment id
   * @return {String}           Session id
   */
  async sessionCreate (environId) {
    let sessionId = await this.cluster.acquire(environId)
    return sessionId
  }

  /**
   * Get a session
   *
   * @param  {String} sessionId Session id
   * @return {Object}           Session details
   */
  async sessionGet (sessionId) {
    const session = await this.cluster.get(sessionId)
    return session
  }

  /**
   * Send a request to a session
   *
   * @param  {String} sessionId Session id
   * @return {Object}           Body of result
   */
  async sessionProxy (sessionId, method, path, body) {
    const url = await this.cluster.resolve(sessionId)
    const uri = url + path
    const options = {
      method,
      uri,
      headers: {
        Accept: 'application/json'
      }
    }
    if (body && body.length && (method === 'POST' || method === 'PUT')) {
      options.body = body
    }
    return new Promise((resolve, reject) => {
      request(options, {retries: 1}, (err, res, body) => {
        if (err) reject(err)
        resolve(body)
      })
    })
  }

  /**
   * Destroy a session
   *
   * @param  {String} sessionId Session id
   */
  async sessionDestroy (sessionId) {
    await this.cluster.stop(sessionId)
  }

  /**
   * List services
   *
   * This host does not provide any services but this
   * method is implemented for API conformity
   *
   * @return {Array} An empty array
   */
  async serviceList () {
    return []
  }

  /**
   * Run this Host
   *
   * Starts the server and cluster (fill and clean up tasks)
   */
  run () {
    this.cluster.start()
    this.server.start()
  }
}

module.exports = Host
