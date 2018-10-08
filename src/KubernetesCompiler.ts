import { SoftwareSession, SoftwareEnvironment } from './types'

/**
 * A compiler for JSON-LD `SoftwareSession` nodes targetting Kubernetes
 */
export default class KubernetesCompiler {
  /**
   * Compiles a session so it is ready for execution
   *
   * This involves resolving, and possibly compiling,
   * the node's `environment` property. Other properties
   * such as `cpu` share etc may need to be compiled also.
   *
   * @param node The JSON-LD node to be compiled
   */
  async compile (node: SoftwareSession): Promise<SoftwareSession> {
    return node
  }

  /**
   * Executes a session on the Kubernetes Cluster
   *
   * A session container is created on the cluster and its id
   * inserted into the session in it's `urls` property.
   *
   * @param node  The JSON-LD node to be compiled
   */
  async execute (node: SoftwareSession): Promise<SoftwareSession> {
    node = await this.compile(node)

    return node
  }
}
