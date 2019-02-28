import bodyParser from 'body-parser'
import express from 'express'
import jwt from 'express-jwt'

import router from './router'
import { SESSIONS_BASE } from './route-paths'

const app = express()

if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node')
  Sentry.init({
    dsn: process.env.SENTRY_DSN
  })
}

if (process.env.NODE_ENV !== 'development') {
  const JWT_SECRET = process.env.JWT_SECRET
  if (!JWT_SECRET) {
    throw Error('JWT_SECRET must be set')
  }

  app.use(jwt({
    secret: JWT_SECRET,
    credentialsRequired: true,
    getToken: function fromHeaderOrQuerystring (req: express.Request) {
      if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
        return req.headers.authorization.split(' ')[1]
      } else if (req.query && req.query.token) {
        return req.query.token
      }
      return null
    }
  }))
}

app.use(SESSIONS_BASE, bodyParser.raw({ type: '*/*' }))
app.use('/', router)
app.listen(2000, () => console.log('Listening on port 2000'))
