const cookie = require('cookie')
const getRawBody = require('raw-body')
const jwt = require('jsonwebtoken')
const Koa = require('koa')
const KoaRouter = require('koa-router')
const PassThrough = require('stream').PassThrough
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
 * Interval between server sent events
 *
 * @type {Number}
 */
const SSE_INTERVAL = 1000

/**
 * Error handling middleware functions
 */
async function errors (ctx, next) {
  try {
    await next()
  } catch (err) {
    ctx.status = err.status || 500
    ctx.body = err.message
    pino.error({msg: err.message, stack: err.stack})
    if (process.env.NODE_ENV === 'development') {
      console.error(err)
    }
  }
}

/**
 * Authentication middleware function
 */
async function auth (ctx, next) {
  let config = null

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
    // Generate a config from token
    try {
      config = jwt.verify(token, JWT_SECRET)
    } catch (err) {
      ctx.throw(403, 'Bad token: ' + token)
    }
  } else {
    // If no token then check for ticket in URL
    let ticket = url.parse(ctx.url, true).query.ticket
    if (ticket) {
      if (ticket !== TICKET) return ctx.throw(403, 'Bad ticket')
      else config = {} // Create an empty config
    }
  }

  if (!config) {
    return ctx.throw(401, 'Authorization required')
  }
}

async function cors (ctx, next) {
  if (next) await next()

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
  await auth(ctx)

  const environId = ctx.params['0']
  // Create a session
  const sessionId = await ctx._host.sessionCreate(environId)
  // Extract details to send to client
  let sessionDetails = {
    id: sessionId,
    environ: environId,
    path: '/sessions!/' + sessionId
  }
  if (ctx.request.query.stream !== undefined) {
    // Set up server sevent (SSE) stream
    const stream = new PassThrough()
    ctx.set('Cache-Control', 'no-cache')
    ctx.set('Connection', 'keep-alive')
    ctx.type = 'text/event-stream'
    ctx.body = stream
    const update = setInterval(async () => {
      let session = await ctx._host.sessionGet(sessionId)
      // Create an event for the update with potentiallly other data
      const event = session.status
      const data = Object.assign(sessionDetails, session)
      stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      // If the pod phase is anything other than 'Pending' (e.g. Running, Succeeded, Failed, Unknown)
      // then end the stream
      if (event !== 'pending') {
        stream.end()
        clearInterval(update)
      }
    }, SSE_INTERVAL)
    // Stop updating when request is closed
    ctx.req.on('close', () => {
      clearInterval(update)
      stream.end()
    })
  } else {
    ctx.body = sessionDetails
  }
}

async function sessionProxy (ctx) {
  const body = await getRawBody(ctx.req)
  ctx.body = await ctx._host.sessionProxy(
    ctx.params.id,
    ctx.method, '/' + ctx.params['0'],
    body
  )
}

// Stencila Host API v0

const v0 = new KoaRouter()

v0.get('/manifest', async ctx => {
  // Rename services to types
  const manifest = await ctx._host.manifest()
  manifest.types = manifest.services
  ctx.body = manifest
})

v0.post('/environ/(.+)', sessionCreate)

v0.all('/sessions!/:id/(.+)', sessionProxy)

v0.delete('/environ/(.+)', async ctx => {
  // This is a no-op for this version of the
  // API because we are not keeping track of
  // user's session via a cookie anymore
  ctx.body = ''
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
  ctx.body = await ctx._host.sessionList()
})

v1.post('/sessions/(.+)', sessionCreate)

v1.get('/sessions/:id', async ctx => {
  ctx.body = await ctx._host.sessionGet(ctx.params.id)
})

v1.all('/sessions!/:id/(.+)', sessionProxy)

v1.delete('/sessions/:id', async ctx => {
  ctx.body = await ctx._host.sessionDestroy(ctx.params.id)
})

// Top level router to route both v0 and v1 APIs
const router = new KoaRouter()

// Endpoint to explicitly provide ticket
router.get('/login', ctx => {
  ctx.body = 'OK'
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
      if (ctx.method === 'GET' && ctx.path === '/') {
        ctx.body = 'OK'
      } else await next()
    })

    // Path to capture all OPTIONS requests including
    // those sent as preflight requests to other endpoints
    app.use(async (ctx, next) => {
      if (ctx.method === 'OPTIONS') {
        await cors(ctx)
        ctx.body = ''
      } else await next()
    })

    app.use(errors)
    app.use(cors)
    app.use(router.routes())

    app.listen(this._port)
  }
}

module.exports = HostHttpServer
