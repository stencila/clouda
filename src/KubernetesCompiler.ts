import { SoftwareSession } from './context'
import { ICluster, CONTAINER_MAP } from './KubernetesCluster'
import { SESSIONS_BASE } from './route-paths'

/**
 * A compiler for JSON-LD `SoftwareSession` nodes targeting Kubernetes
 */
export default class KubernetesCompiler {
  constructor (private cluster: ICluster) {
  }

  /**
   * Compiles a session so it is ready for execution
   *
   * This involves resolving, and possibly compiling,
   * the session's `environment` property. Other properties
   * such as `cpu` share etc may need to be compiled also.
   *
   * @param session The JSON-LD session to be compiled
   */
  async compile (session: SoftwareSession): Promise<SoftwareSession> {
    if (!session.urls) {
      session.urls = []
    }

    if (!session.environment.image) {
      let container = CONTAINER_MAP.get(session.environment.id)

      if (!container) {
        throw new TypeError(`No container is defined with environment id ${session.environment.id}`)
      }

      session.environment.image = container.image
    }

    return session
  }

  /**
   * Executes a session on the Kubernetes Cluster
   *
   * A session container is created on the cluster and its id
   * inserted into the session in it's `urls` property.
   *
   * @param session  The JSON-LD session to be compiled
   * @param baseUrl  The base URL for the request invoking this method
   */
  async execute (session: SoftwareSession, baseUrl: string): Promise<SoftwareSession> {
    session = await this.compile(session)

    let sessionId = await this.cluster.spawn(session, 'demanded')

    session.urls.push(`${baseUrl}${SESSIONS_BASE}${sessionId}`)

    return session
  }
}
