import { Router, Request, Response, json } from 'express'

const router = Router()

import KubernetesCompiler from './KubernetesCompiler'
import { KubernetesCluster } from './KubernetesCluster'
import * as url from 'url'
import { SESSIONS_BASE } from './route-paths'

const cluster = new KubernetesCluster()
const compiler = new KubernetesCompiler(cluster)

router.use(json())

function run (method: string) {
  return async (req: Request, res: Response) => {
    try {
      await cluster.init()

      let node = null

      if (method === 'execute') {
        let baseUrl = url.format({
          protocol: req.protocol,
          host: req.get('host'),
          pathname: ''
        })
        node = await compiler.execute(req.body, baseUrl)
      } else if (method === 'sessionProxy') {

        const response = cluster.sessionProxy(req.params.sessionId, req.method, '/' + req.params[0], req.body)
        res.status(200).send(response)
      } else {
        // @ts-ignore
        node = await compiler[method](req.body)
      }
      if (node !== null) {
        res.status(200).json(node)
      }
    } catch (error) {
      res.status(500).send(error.stack)
    }
  }
}

router.put('/compile', run('compile'))
router.put('/execute', run('execute'))
router.all(`${SESSIONS_BASE}(:sessionId)/*`, run('sessionProxy'))

export default router
