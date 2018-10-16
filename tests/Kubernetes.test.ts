import { default as Compiler } from '../src/KubernetesCompiler'
import { SoftwareEnvironment, SoftwareSession as Session } from '../src/context'
import { ICluster } from '../src/KubernetesCluster'

const environment = new SoftwareEnvironment('stencila/core')

class MockKubernetesCluster implements ICluster {
  async spawn (environId: string, reason: string): Promise<string> {
    return 'session-id'
  }
}

const cluster = new MockKubernetesCluster()

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
