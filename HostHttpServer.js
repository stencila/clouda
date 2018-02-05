const body = require('body')
const cookie = require('cookie')
const crypto = require('crypto')
const merry = require('merry')
const path = require('path')
const pathIsInside = require('path-is-inside')
const sendFile = require('send')
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
 * We use signed JSON objects, stored as Base64 encoded cookies on the client,
 * for persisting session state across calls. We do not use the Jason Web Tokens (JWT) for this
 * as they have security vulnerabilities. We do not use Macroons for this as they are focussed
 * on authorizing capabilities instead of storing state.
 */
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
function sessionInitialize (token, req, res, ctx) {
  const parts = token.split('.')
  if (parts.length !== 2) return error(req, res, ctx, 400, 'Malformed token')

  let json = Buffer.from(parts[0], 'base64').toString()
  let session
  try {
    session = JSON.parse(json)
  } catch (err) {
    return error(req, res, ctx, 400, 'Malformed token')
  }

  let signat = Buffer.from(parts[1], 'base64').toString()
  if (signat !== signature(session)) {
    return error(req, res, ctx, 403, 'Bad token')
  }
  return session
}

// Generate a token from a session object
function sessionFinalize (session) {
  return Buffer.from(JSON.stringify(session)).toString('base64') + '.' + Buffer.from(signature(session)).toString('base64')
}

// General error functions
function error (req, res, ctx, code, message) {
  ctx.log.error('Error', message, req.url)
  ctx.send(code, { message: message })
}

// Receive a request
function receive (req, res, ctx, regex, cb) {
  const match = url.parse(req.url).pathname.match(regex)
  if (!match) return error(req, res, ctx, 400, 'Bad request')

  let session = null

  // Attempt to get authorization token from cookie
  let token = cookie.parse(req.headers.cookie || '').token
  if (token) {
    // Generate a session from token
    session = sessionInitialize(token, req, res, ctx)
  } else {
    // If no token then check for ticket in URL
    let ticket = url.parse(req.url, true).query.ticket
    if (ticket) {
      if (ticket !== TICKET) return error(req, res, ctx, 403, 'Bad ticket')
      else session = {} // Create an empty session
    }
  }

  // Allow null sessions so that manifest can be obtained from a unticketed
  // GET / - the endpoint which is used by Kubernetes Ingress as a readyness probe

  // Get request body and parse it
  body(req, (err, body) => {
    if (err) return error(req, res, ctx, 500, err.message)
    cb(match, session, body)
  })
}

// Generate headers for a response
function headers (req, session) {
  let headers = {}

  // CORS headers are used to control access by browsers. In particular, CORS
  // can prevent access by XHR requests made by Javascript in third party sites.
  // See https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS

  // Get the Origin header (sent in CORS and POST requests) and fall back to Referer header
  // if it is not present (either of these should be present in most browser requests)
  let origin = req.headers.origin
  if (!origin && req.headers.referer) {
    let uri = url.parse(req.headers.referer || '')
    origin = `${uri.protocol}//${uri.host}`
  }

  // If an origin has been found and is authorized set CORS headers
  // Without these headers browser XHR request get an error like:
  //     No 'Access-Control-Allow-Origin' header is present on the requested resource.
  //     Origin 'http://evil.hackers:4000' is therefore not allowed access.
  if (origin) {
    // 'Simple' requests (GET and POST XHR requests)
    headers = Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      // Allow sending cookies and other credentials
      'Access-Control-Allow-Credentials': 'true'
    })
    // Pre-flighted requests by OPTIONS method (made before PUT, DELETE etc XHR requests and in other circumstances)
    // get additional CORS headers
    if (req.method === 'OPTIONS') {
      headers = Object.assign(headers, {
        // Allowable methods and headers
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        // "how long the response to the preflight request can be cached for without sending another preflight request"
        'Access-Control-Max-Age': '86400' // 24 hours
      })
    }
  }

  if (session && req.method !== 'OPTIONS') {
    // Generate a token from session and set cookie
    const token = sessionFinalize(session)
    headers['Set-Cookie'] = `token=${token}`
  }

  return headers
}

// Send a response
function send (req, res, ctx, body, session) {
  ctx.send(200, body || ' ', headers(req, session))
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
      send(req, res, ctx)
    })

    app.route('GET', '/*', (req, res, ctx) => {
      receive(req, res, ctx, /\/(.*)/, (match, session) => {
        let acceptJson = (req.headers['accept'] || '').match(/application\/json/)
        if (acceptJson) {
          this._host.manifest(session, (err, manifest, session) => {
            if (err) return error(req, res, ctx, 500, err.message)
            send(req, res, ctx, manifest, session)
          })
        } else {
          let staticPath = path.join(__dirname, 'static')
          let requestPath = match[1] || 'index.html'
          let filePath = path.join(staticPath, url.parse(requestPath).pathname)
          if (!pathIsInside(filePath, staticPath)) {
            return error(req, res, ctx, 403, filePath)
          } else {
            sendFile(req, filePath).on('headers', (res) => {
              let headers_ = headers(req, session)
              for (let key of Object.keys(headers_)) res.setHeader(key, headers_[key])
            }).pipe(res)
          }
        }
      })
    })

    app.route('POST', '/*', (req, res, ctx) => {
      receive(req, res, ctx, /\/(.+)/, (match, session, body) => {
        if (!session) return error(req, res, ctx, 401, 'Authentication required')
        const type = match[1]
        this._host.post(type, body, session, (err, address, session) => {
          if (err) return error(req, res, ctx, 500, err.message)
          send(req, res, ctx, address, session)
        })
      })
    })

    app.route('PUT', '/*', (req, res, ctx) => {
      receive(req, res, ctx, /\/([^!]+)!(.+)/, (match, session, body) => {
        if (!session) return error(req, res, ctx, 401, 'Authentication required')
        const address = match[1]
        const method = match[2]
        this._host.put(address, method, body, session, (err, result, session) => {
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
      console.log(`To sign in,\n  HTTPie:    http --session=/tmp/session.json ':${this._port}/?ticket=${TICKET}'`)
    }

    app.listen(this._port)
  }
}

module.exports = HostHttpServer
