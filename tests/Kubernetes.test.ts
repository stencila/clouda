import KubernetesCompiler from '../src/KubernetesCompiler'

test('compile', async () => {
  const compiler = new KubernetesCompiler()

  const compiled = await compiler.compile({})
  expect(compiled).toEqual({})
})

test('execute', async () => {
  const compiler = new KubernetesCompiler()

  const executed = await compiler.execute({})
  expect(executed).toEqual({})
})
