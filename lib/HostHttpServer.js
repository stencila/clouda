const cookie = require('cookie')
const getRawBody = require('raw-body')
const jwt = require('jsonwebtoken')
const Koa = require('koa')
const KoaRouter = require('koa-router')
const pino = require('pino')()
const url = require('url')

/**
 * Access ticket
 */
var TICKET = process.env.TICKET
if (!TICKET) {
  if (process.env.NODE_ENV === 'development') TICKET = 'platypus'
  else throw Error('TICKET must be set')
}

/**
 * Secret for JSON web tokens.
 */
var JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'development') JWT_SECRET = 'not-a-secret'
  else throw Error('JWT_SECRET must be set')
}

/**
 * Error handling middleware functions
 */
async function errors (ctx, next) {
  try {
    await next()
  } catch (err) {
    ctx.status = err.status || 500
    ctx.body = err.message
    pino.error({msg: err.message})
  }
}

/**
 * Authentication middleware function
 */
async function auth (ctx, next) {
  let user = null

  // Attempt to get authorization token from (1) query parameter (2) header (3) cookie
  let token = url.parse(ctx.url, true).query.token
  if (!token && ctx.headers.authorization) {
    const auth = ctx.headers.authorization
    const parts = auth.split(' ')
    if (parts[0] === 'Bearer') {
      token = parts[1]
    }
  }
  if (!token) {
    token = cookie.parse(ctx.headers.cookie || '').token
  }
  if (token) {
    // Generate a user from token
    try {
      user = jwt.verify(token, JWT_SECRET)
    } catch (err) {
      ctx.throw(403, 'Bad token: ' + token)
    }
  } else {
    // If no token then check for ticket in URL
    let ticket = url.parse(ctx.url, true).query.ticket
    if (ticket) {
      if (ticket !== TICKET) return ctx.throw(403, 'Bad ticket')
      else user = {} // Create an empty user
    }
  }

  if (!user && ctx.method !== 'OPTIONS') {
    return ctx.throw(401, 'Authorization required')
  }

  ctx._user = user
  await next()
  user = ctx._user

  if (user && ctx.method !== 'OPTIONS') {
    // Generate a token from user and set cookie to expire
    // after an hour of inactivity
    const token = jwt.sign(user, JWT_SECRET)
    ctx.set('Set-Cookie', `token=${token}; Path=/; Max-Age=3600`)
  }
}

async function cors (ctx, next) {
  await next()

  // CORS headers are used to control access by browsers. In particular, CORS
  // can prevent access by XHR requests made by Javascript in third party sites.
  // See https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS

  // Get the Origin header (sent in CORS and POST requests) and fall back to Referer header
  // if it is not present (either of these should be present in most browser requests)
  let origin = ctx.headers.origin
  if (!origin && ctx.headers.referer) {
    let uri = url.parse(ctx.headers.referer || '')
    origin = `${uri.protocol}//${uri.host}`
  }

  // If an origin has been found and is authorized set CORS headers
  // Without these headers browser XHR request get an error like:
  //     No 'Access-Control-Allow-Origin' header is present on the requested resource.
  //     Origin 'http://evil.hackers:4000' is therefore not allowed access.
  if (origin) {
    // 'Simple' requests (GET and POST XHR requests)
    ctx.set('Access-Control-Allow-Origin', origin)
    // Allow sending cookies and other credentials
    ctx.set('Access-Control-Allow-Credentials', 'true')
    // Pre-flighted requests by OPTIONS method (made before PUT, DELETE etc XHR requests and in other circumstances)
    // get additional CORS headers
    if (ctx.method === 'OPTIONS') {
      // Allowable methods and headers
      ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      ctx.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      // "how long the response to the preflight request can be cached for without sending another preflight request"
      ctx.set('Access-Control-Max-Age', '86400') // 24 hours
    }
  }
}

// Handler functions shared across API versions

async function sessionCreate (ctx) {
  const environId = ctx.params['0']
  ctx.body = await ctx._host.sessionCreate(ctx._user, environId)
}

async function sessionProxy (ctx) {
  const body = await getRawBody(ctx.req)
  ctx.body = await ctx._host.sessionProxy(
    ctx._user, ctx.params.id,
    ctx.method, '/' + ctx.params['0'],
    body
  )
}

// Stencila Host API v0

const v0 = new KoaRouter()

v0.get('/manifest', async ctx => {
  // Rename services to types
  const manifest = await ctx._host.manifest(ctx._user)
  manifest.types = manifest.services
  ctx.body = manifest
})

v0.post('/environ/(.+)', sessionCreate)

v0.all('/sessions!/:id/(.+)', sessionProxy)

v0.delete('/environ/(.+)', async ctx => {
  // Instead of using the environId that was passed, just
  // destroy the users current session
  ctx.body = await ctx._host.sessionDestroy(ctx._user, ctx._user.sessionId)
})

// Stencila Host API v1

const v1 = new KoaRouter()

v1.get('/manifest', async ctx => {
  ctx.body = await ctx._host.manifest()
})

v1.get('/environs', async ctx => {
  ctx.body = await ctx._host.environList()
})

v1.get('/services', async ctx => {
  ctx.body = await ctx._host.serviceList()
})

v1.get('/sessions', async ctx => {
  ctx.body = await ctx._host.sessionList(ctx._user)
})

v1.post('/sessions/(.+)', sessionCreate)

v1.get('/sessions/:id', async ctx => {
  ctx.body = await ctx._host.sessionGet(ctx._user, ctx.params.id)
})

v1.all('/sessions!/:id/(.+)', sessionProxy)

v1.delete('/sessions/:id', async ctx => {
  ctx.body = await ctx._host.sessionDestroy(ctx._user, ctx.params.id)
})

// Top level router to route both v0 and v1 APIs
const router = new KoaRouter()

// Endpoint to explicitly provide ticket
router.get('/login', ctx => {
  ctx.body = ''
})

router.use('/v0', v0.routes(), v0.allowedMethods())
router.use('/v1', v1.routes(), v1.allowedMethods())

class HostHttpServer {
  constructor (host, address = '127.0.0.1', port = 2000) {
    this._host = host
    this._address = address
    this._port = port
  }

  start () {
    const app = new Koa()

    // Set the Stencila host on the app `ctx`
    // Need to use `_host` as `host` is already used
    app.context._host = this._host

    // A default, non-authenticated
    // path for Kubernetes health checks (amongst other things)
    app.use(async (ctx, next) => {
      if (ctx.path === '/') ctx.body = 'OK'
      else await next()
    })

    app.use(errors)
    app.use(auth)
    app.use(cors)
    app.use(router.routes())

    app.listen(this._port)
  }
}

module.exports = HostHttpServer
