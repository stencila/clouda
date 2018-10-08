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
