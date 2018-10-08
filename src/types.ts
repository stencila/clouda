/**
 * A temporary module for representing types that the `KubernetesCompiler`
 * will handle.
 *
 * This is temporary because these type definitions soon be moved to a `types` repo so that
 * they can be used by other Stencila "compilers".
 */

 // schema.org basic datatypes https://schema.org/DataType
type Text = string
type URL = Text
type DateTime = string // https://schema.org/DateTime

/**
 * A session (i.e. a container) within a software environment (i.e. an image)
 * 
 * There is no schema.org type representing a session or container. So it makes
 * sense to define something here based the Open Container Initiative (OCI):
 * 
 * - https://github.com/opencontainers/runtime-spec/blob/master/config-linux.md
 * - https://github.com/opencontainers/runtime-spec/blob/master/schema/config-schema.json
 * - https://github.com/opencontainers/runtime-spec/blob/master/schema/config-linux.json
 * 
 * and for the `KubernetesCompiler` to translate it into the Kubernetes API:
 * 
 * - https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.12/#container-v1-core
 */
export class SoftwareSession {
  environment?: SoftwareEnvironment
  urls: Array<URL> = []
}

/**
 * A software environment (i.e. an image)
 */
export class SoftwareEnvironment {

}
