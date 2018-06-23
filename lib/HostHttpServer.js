const cookie = require('cookie')
const jwt = require('jsonwebtoken')
const Koa = require('koa')
const KoaRouter = require('koa-router')
const getRawBody = require('raw-body')
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
var TOKEN_SECRET = process.env.TOKEN_SECRET
if (!TOKEN_SECRET) {
  if (process.env.NODE_ENV === 'development') TOKEN_SECRET = 'not-a-secret'
  else throw Error('TOKEN_SECRET must be set')
}

/**
 * Authentication middleware function
 *
 * @param  {[type]}   ctx  [description]
 * @param  {Function} next [description]
 * @return {[type]}        [description]
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
      user = jwt.verify(token, TOKEN_SECRET)
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

  ctx._user = user
  await next()
  user = ctx._user

  if (user && ctx.method !== 'OPTIONS') {
    // Generate a token from user and set cookie to expire
    // after an hour of inactivity
    const token = jwt.sign(user, TOKEN_SECRET)
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

function options (ctx) {
  // Body must be set to avoid 404
  ctx.body = ''
}

async function proxy (ctx) {
  const body = await getRawBody(ctx.req)
  ctx.body = await ctx._host.sessionProxy(
    ctx._user, ctx.params.id,
    ctx.method, '/' + ctx.params['0'],
    body
  )
}

// Stencila Host API v0

const v0 = new KoaRouter()

v0.options('/', options)

v0.get('/manifest', async ctx => {
  // Rename services to types
  const manifest = await ctx._host.manifest(ctx._user)
  manifest.types = manifest.services
  ctx.body = manifest
})

v0.post('/environ/(.+)', async ctx => {
  ctx.body = await ctx._host.sessionCreate(ctx._user, ctx.params['0'])
})

v0.all('/session!/:id/(.+)', proxy)

v0.delete('/environ/:id', async ctx => {
  ctx.body = await ctx._host.sessionDestroy(ctx._user, ctx.params.id)
})

// Stencila Host API v1

const v1 = new KoaRouter()

v1.options('/', options)

v1.get('/manifest', async ctx => {
  ctx.body = await ctx._host.manifest()
})

v1.get('/session', async ctx => {
  ctx.body = await ctx._host.sessionList(ctx._user)
})

v1.post('/session/(.+)', async ctx => {
  ctx.body = await ctx._host.sessionCreate(ctx._user, ctx.params['0'])
})

v1.get('/session/:id', async ctx => {
  ctx.body = await ctx._host.sessionGet(ctx._user, ctx.params.id)
})

v1.all('/session!/:id/(.+)', async ctx => {
  ctx.body = await ctx._host.sessionProxy(
    ctx._user, ctx.params.id,
    ctx.method, '/' + ctx.params['0'],
    ctx.request.body
  )
})

v1.delete('/session/:id', async ctx => {
  ctx.body = await ctx._host.sessionDestroy(ctx._user, ctx.params.id)
})

// Top level router to route both v0 and v1 APIs
const router = new KoaRouter()
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

    app.use(auth)
    app.use(cors)
    app.use(router.routes())

    app.listen(this._port)
  }
}

module.exports = HostHttpServer
