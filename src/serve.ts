import express, { Request, Response, json } from 'express'
import expressJwt from 'express-jwt'
import httpProxy from 'http-proxy'
import url from 'url'

import KubernetesCompiler from './KubernetesCompiler'
import KubernetesCluster from './KubernetesCluster'
import { SESSIONS_BASE } from './route-paths'

import pino from 'pino'

const logger = pino()

const cluster = new KubernetesCluster()
const compiler = new KubernetesCompiler(cluster)

const app = express()

if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node')
  Sentry.init({
    dsn: process.env.SENTRY_DSN
  })
}

// Handle session proxying before any body parsing, JWT handling etc
const sessionProxy = httpProxy.createProxyServer()
app.all(`${SESSIONS_BASE}(:sessionId)/*`, async (req, res) => {
  const podUrl = await cluster.resolve(req.params.sessionId)
  req.url = req.url.replace(`${SESSIONS_BASE}${req.params.sessionId}/`, '/')
  sessionProxy.web(req, res, { target: podUrl })
})

if (!(process.env.NODE_ENV === 'development' || process.env.JWT_DISABLE === 'true')) {
  const JWT_SECRET = process.env.JWT_SECRET
  if (!JWT_SECRET) {
    throw Error('JWT_SECRET must be set')
  }

  app.use(expressJwt({
    secret: JWT_SECRET,
    credentialsRequired: true,
    getToken: function fromHeaderOrQuerystring (req: Request) {
      if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
        return req.headers.authorization.split(' ')[1]
      } else if (req.query && req.query.token) {
        return req.query.token
      }
      return null
    }
  }))
}

function run (method: string) {
  return async (req: Request, res: Response) => {
    try {
      let node = null
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
      if (node !== null) {
        res.status(200).json(node)
      }
    } catch (error) {
      res.status(500).send(error.stack)
    }
  }
}

app.use(json())

app.put('/compile', run('compile'))
app.put('/execute', run('execute'))

app.put('/status', async (req: Request, res: Response) => {
  try {
    res.status(200).json(
        await cluster.status(req.body.id)
    )
  } catch (error) {
    res.status(500).send(error.stack)
    logger.error({ msg: error.message, stack: error.stack })
  }
})

app.listen(2000, () => console.log('Listening on http://127.0.0.1:2000'))
