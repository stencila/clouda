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
      }
    ]

    this.server = new HostHttpServer(this)

    const Cluster = process.env.NODE_ENV === 'development' ? DockerCluster : KubernetesCluster
    this.cluster = new Cluster()
  }

  /**
   * Get the host's manifest
   *
   * @return {Object} A manifest object
   */
  async manifest (user) {
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
  async environList (user) {
    return this.environs
  }

  /**
   * List sessions
   *
   * User's can only have one session at any time.
   * So this just returns the session id from the users token.
   *
   * @return {Array[String]} An array of session ids
   */
  async sessionList (user) {
    return user ? [user.sessionId] : []
  }

  /**
   * Create a session
   *
   * @param  {String} environId Environment id
   * @return {Object}           Session info
   */
  async sessionCreate (user, environId) {
    const sessionId = await this.cluster.acquire(environId)
    return {
      id: sessionId,
      environ: environId,
      path: '/session!/' + sessionId
    }
  }

  /**
   * Get a session
   *
   * @param  {String} sessionId Session id
   * @return {Object}           Session details
   */
  async sessionGet (user, sessionId) {
    const session = await this.cluster.get(sessionId)
    return session
  }

  /**
   * Send a request to a session
   *
   * @param  {String} sessionId Session id
   * @return {Object}           Body of result
   */
  async sessionProxy (user, sessionId, method, path, body) {
    const url = await this.cluster.resolve(sessionId)
    const uri = url + path
    const options = {
      method,
      uri,
      headers: {
        Accept: 'application/json'
      }
    }
    if (body && (method === 'POST' || method === 'PUT')) {
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
  async sessionDestroy (user, sessionId) {
    await this.cluster.stop(sessionId)
  }

  /**
   * List services
   *
   * Theis hOst does not provide any services but this
   * method is implemented for API conformity
   *
   * @return {Array} An empty array
   */
  async serviceList (user) {
    return []
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
