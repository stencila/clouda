import {default as Compiler } from '../src/KubernetesCompiler'
import {SoftwareSession as Session } from '../src/types'

test('compile', async () => {
  const compiler = new Compiler()

  const session = new Session()
  const compiled = await compiler.compile(session)
  expect(compiled).toEqual(session)
})

test('execute', async () => {
  const compiler = new Compiler()

  const session = new Session()
  const executed = await compiler.execute(session)
  expect(executed).toEqual(session)
})
