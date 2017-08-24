const body = require('body')
const cookie = require('cookie')
const crypto = require('crypto')
const merry = require('merry')
const url = require('url')

var TOKEN_SECRET = process.env.TOKEN_SECRET
if (!TOKEN_SECRET) {
  if (process.env.NODE_ENV === 'development') TOKEN_SECRET = 'a super unsecet key'
  else throw Error('TOKEN_SECRET must be set')
}

// Generate a signature for a session object
function signature (session) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(JSON.stringify(session)).digest('hex')
}

// Generate a verified session object from a token
function signin (token, req, res, ctx) {
  const json = Buffer.from(token, 'base64').toString()
  let object
  try {
    object = JSON.parse(json)
  } catch (err) {
    return error(req, res, ctx, 400, 'Malformed token')
  }
  if (object.signature !== signature(object.session)) {
    return error(req, res, ctx, 401, 'Authentication required')
  }
  const session = object.session
  return session
}

// Generate a token from a session object
function signout (session) {
  const object = {
    session: session,
    signature: signature(session)
  }
  const json = JSON.stringify(object)
  const token = Buffer.from(json).toString('base64')
  return token
}

// General error functions
function error (req, res, ctx, code, message) {
  ctx.log.error('Error', message, req.url)
  ctx.send(code, { message: message })
}

// Receive a request
function receive (req, res, ctx, regex, cb) {
  const match = url.parse(req.url).pathname.match(regex)
  if (!match) return error(req, res, ctx, 400, 'Bad Request')

  // Attempt to get authorization token from cookie...
  let token = cookie.parse(req.headers.cookie || '').token
  // ...or, from Authorization header
  if (!token && req.headers.authorization) {
    const match = req.headers.authorization.match(/^Token (.+)$/)
    if (match) token = match[1]
  }
  // ...or, from query parameter
  if (!token) token = url.parse(req.url, true).query.token

  // Forbid access if no token found
  if (!token) {
    return error(req, res, ctx, 401, 'Authentication required')
  }

  // Generate a session from token
  const session = signin(token, req, res, ctx)

  // Get request body and parse it
  body(req, (err, body) => {
    if (err) return error(req, res, ctx, 500, err.message)
    let data
    if (body) {
      try {
        data = JSON.parse(body)
      } catch (err) {
        return error(req, res, ctx, 400, 'Invalid JSON in request body')
      }
    }
    cb(match, session, data)
  })
}

// Send a response
function send (req, res, ctx, body, session) {
  let origin = 'http://' + url.parse(req.headers.referer || '').host
  let headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true'
  }

  // Generate a token from session and set cookie
  const token = signout(session)
  headers['Set-Cookie'] = `token=${token}`

  ctx.send(200, body || ' ', headers)
}


class HostHttpServer {
  constructor (host, address = '127.0.0.1', port = 2000) {
    this._host = host
    this._address = address
    this._port = port
  }

  start () {
    const app = merry()

    app.route('OPTIONS', '/*', (req, res, ctx) => {
      // CORS headers added to all requests to allow direct access by browsers
      // See https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Max-Age', '1728000')
      send(req, res, ctx)
    })

    app.route('GET', '/', (req, res, ctx) => {
      receive(req, res, ctx, /\//, (match, session, data) => {
        this._host.manifest(session, (err, manifest, session) => {
          if (err) return error(req, res, ctx, 500, err.message)
          send(req, res, ctx, manifest, session)
        })
      })
    })

    app.route('POST', '/*', (req, res, ctx) => {
      receive(req, res, ctx, /\/(.+)/, (match, session, data) => {
        const type = match[1]
        const options = data
        const name = options && options.name
        this._host.post(type, options, name, session, (err, address, session) => {
          if (err) return error(req, res, ctx, 500, err.message)
          send(req, res, ctx, address, session)
        })
      })
    })

    app.route('PUT', '/*', (req, res, ctx) => {
      receive(req, res, ctx, /\/([^!]+)!(.+)/, (match, session, data) => {
        const address = match[1]
        const method = match[2]
        const args = data
        this._host.put(address, method, args, session, (err, result, session) => {
          if (err) return error(req, res, ctx, 500, err.message)
          send(req, res, ctx, result, session)
        })
      })
    })

    app.route('default', (req, res, ctx) => {
      ctx.log.warn('path not found for', req.url)
      ctx.send(404, { message: 'not found' })
    })

    if (process.env.NODE_ENV === 'development') {
      console.log(`Use this token to sign in using HTTPie\nhttp --session=/tmp/session.json ':${this._port}/?token=${signout({})}'`)
    }

    app.listen(this._port)
  }
}

module.exports = HostHttpServer
