import { default as Compiler } from '../src/KubernetesCompiler'
import { SoftwareEnvironment, SoftwareSession as Session } from '../src/context'
import KubernetesCluster from '../src/KubernetesCluster'

const environment = new SoftwareEnvironment('stencila/core')
const cluster = new KubernetesCluster()

test('compile', async () => {
  const compiler = new Compiler(cluster)

  const session = new Session(environment)
  const compiled = await compiler.compile(session)
  expect(compiled).toEqual(session)
})

test('execute', async () => {
  const compiler = new Compiler(cluster)

  const session = new Session(environment)
  const executed = await compiler.execute(session, 'baseUrl')
  expect(executed).toEqual(session)
})
