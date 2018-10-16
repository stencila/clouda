import { Router, Request, Response, json } from 'express'

const router = Router()

import KubernetesCompiler from './KubernetesCompiler'
import { KubernetesCluster } from './KubernetesCluster'
import * as url from 'url'

const cluster = new KubernetesCluster()
const compiler = new KubernetesCompiler(cluster)

router.use(json())

function run (method: string) {
  return async (req: Request, res: Response) => {
    try {
      await cluster.init()

      let node

      if (method === 'execute') {
        let baseUrl = url.format({
          protocol: req.protocol,
          host: req.get('host'),
          pathname: ''
        })
        node = await compiler.execute(req.body, baseUrl)
      } else {
        // @ts-ignore
        node = await compiler[method](req.body)
      }

      res.status(200).json(node)
    } catch (error) {
      res.status(500).send(error.stack)
    }
  }
}

router.put('/compile', run('compile'))
router.put('/execute', run('execute'))

export default router
