const cookie = require('cookie')
const eos = require('end-of-stream')
const jwt = require('jsonwebtoken')
const merry = require('merry')
const path = require('path')
const pump = require('pump')
const send = require('send')
const spawn = require('child_process').spawn
const url = require('url')

const errors = require('./errors')

const env = {
  PORT: 3000,          // Port for the server to listen on
  TOKEN_SECRET: String // JWT token secret should be set as an environment variable
}

const app = merry({ env: env })

// Static content in `client` folder
app.route('GET', '/~client/*', function (req, res, ctx) {
  const source = send(req, path.join('client', req.url.subString(8)))
  pump(source, res, function (err) {
    if (err) errors.EPIPE(req, res, ctx, err)
  })
})

// Launch stream.
//
// Runs the `sibyl` Bash script and creates a server send event stream of it's
// output which is displayed by `client.js`.
// See https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
app.route('GET', '/~launch/*', function (req, res, ctx) {
  res.setHeader('content-type', 'text/event-stream')

  // Prevent nginx from buffering the stream
  if (req.headers['x-nginx']) res.setHeader('X-Accel-Buffering', 'no')

  // Launch `sibyl` Bash script and send output
  // and errors as SSE events until it exits
  const uri = url.parse(req.url)
  const address = uri.path.substring(9)
  const mock = uri.query && uri.query.mock ? '--mock' : ''
  const sibyl = spawn('./sibyl.sh', ['launch', address, mock])
  sibylToStream(sibyl, req, res, ctx)
})

// Container session
app.route('GET', '/~session/*', proxyToSession)
app.route('POST', '/~session/*', proxyToSession)
app.route('PUT', '/~session/*', proxyToSession)
app.route('DELETE', '/~session/*', proxyToSession)

// All other non-tilded paths get "rewritten" to
// container sessions
app.route('GET', '/*', function (req, res, ctx) {
  if (req.url === '/' || req.url.match(/^\/[a-z]+:\/\/.+/)) {
    const source = send(req, 'client/index.html')
    pump(source, res, function (err) {
      if (err) errors.EPIPE(req, res, ctx, err)
    })
  } else {
    rewriteToSession(req, res, ctx)
  }
})
app.route('POST', '/*', rewriteToSession)
app.route('PUT', '/*', rewriteToSession)
app.route('DELETE', '/*', rewriteToSession)

// Handle 404 routes
app.route('default', errors.EURLNOTFOUND)

// Start the app
app.listen()

// Safely forward the sibyl script into a stream of messages
// Connects the sibyl child process, a write stream and a context
function sibylToStream (sibyl, req, res, ctx) {
  var closed = false

  sibyl.stdout.on('data', onStdout)
  sibyl.stderr.on('data', onStderr)
  sibyl.on('exit', onExit)

  eos(res, function (err) {
    if (err) ctx.log.error(err)
    ctx.log.debug('closing SSE stream')
    sibyl.stdout.removeListener('data', onStdout)
    sibyl.stderr.removeListener('data', onStderr)
    sibyl.removeListener('exit', onExit)
    closed = true
  })

  function onStdout (data) {
    if (closed) return
    for (let line of data.toString().split('\n')) {
      if (line.length) {
        const match = line.match(/^GOTO (.+)$/)
        if (match) {
          const url = match[1]
          const token = jwt.sign({ url: url }, ctx.env.TOKEN_SECRET, { expiresIn: '12h' })
          ctx.log.debug('SSE: sending stdout goto')
          res.write(`event: goto\ndata: ${token}\n\n`)
        } else {
          ctx.log.debug('SSE: sending stdout data')
          res.write(`event: stdout\ndata: ${line}\n\n`)
        }
      }
    }
  }

  function onStderr (data) {
    if (closed) return
    for (let line of data.toString().split('\n')) {
      ctx.log.debug('SSE: sending stderr data')
      res.write(`event: stderr\ndata: ${line}\n\n`)
    }
  }

  function onExit (data) {
    if (closed) return
    ctx.log.debug('SSE: sending end event')
    res.write(`event: end\ndata: ${data}\n\n`)
  }
}

// Proxy/redirect requests to a container session
function proxyToSession (req, res, ctx) {
  const match = req.url.match(/\/~session\/([^/]+)((\/)(.*))?/)
  const token = match[1]
  const slash = match[3]
  const path = match[4]

  // Redirect to trailing slash URL so that relative paths in session
  // requests work as expected
  if (!slash) {
    res.statusCode = 301
    res.setHeader('Location', `/~session/${token}/`)
    return res.end()
  }

  jwt.verify(token, ctx.env.TOKEN_SECRET, function (err, payload) {
    if (err) return errors.ESESSIONINVALID(req, res, ctx, err)

    const url = payload.url
    if (req.headers['x-nginx']) {
      // Proxy to session URL using Nginx
      res.statusCode = 200
      res.setHeader('X-Accel-Redirect', `/proxy-to-session/${req.method}/${url}/${path}`)
      // Set a cookie so that subsequent requests to absolute paths can
      // be rewritten to the session
      let cookies = cookie.parse(req.headers.cookie || '')
      if (!cookies.session) res.setHeader('Set-Cookie', cookie.serialize('session', token))
    } else {
      // Redirect to session URL
      res.statusCode = 308
      res.setHeader('Location', `${url}/${path}`)
    }

    res.end()
  })
}

// Rewrite the URL to point to the session obtained from the
// `Referer` header or from the `session` cookie
//
// Need to use a cookie because `Referer` is not always set or
// is set but not as a URL including the session token (e.g for fonts)
// Should we just use the cookie and forget about Referer?
//
// This allows us to deal with absolute paths in requests made from
// HTML & JavaScript hosted within the container. Although this seems
// a bit hacky, a previous approach required an equal amount of hackyness
// (and much URL ugliness) within the container hosted HTML/JS and servers.
function rewriteToSession (req, res, ctx) {
  let token
  let referer = req.headers.referer
  if (referer) {
    let match = referer.match(/\/~session\/([^/]+)/)
    if (match) token = match[1]
  }
  if (!token) {
    let cookies = cookie.parse(req.headers.cookie || '')
    if (cookies.session) token = cookies.session
  }
  if (token) {
    req.url = `/~session/${token}${req.url}`
    return proxyToSession(req, res, ctx)
  }
  errors.EURLNOTFOUND(req, res, ctx)
}
