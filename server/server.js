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

// Connect to the launched container

app.route('GET', '/~session/:token', function (req, res, ctx) {
  jwt.verify(ctx.params.token, ctx.env.TOKEN_SECRET, function (err, payload) {
    if (err) return errors.ESESSIONINVALID(req, res, ctx, err)

    const url = payload.url
    if (req.headers['x-nginx']) {
      res.statusCode = 200
      res.setHeader('X-Accel-Redirect', `/internal-session/${url}`)
    } else {
      res.statusCode = 301
      res.setHeader('Location', url)
    }

    res.end()
  })
})

// Launch page
app.route('GET', '/*', function (req, res, ctx) {
  const source = send(req, 'client/launch.html')
  pump(source, res, function (err) {
    if (err) errors.EPIPE(req, res, ctx, err)
  })
})

// Home page
app.route('GET', '/', function (req, res, ctx) {
  const source = send(req, 'client/index.html')
  pump(source, res, function (err) {
    if (err) errors.EPIPE(req, res, ctx, err)
  })
})

// Handle 404 routes
app.route('default', errors.EURLNOTFOUND)

// Start the app
app.listen()

// Safely forward the sibyl script into a stream of messages
// Connects the sibyl child process, a write stream and a koa context
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
          const token = jwt.sign({ url: url }, ctx.env.TOKEN_SECRET, { expiresIn: '1h' })
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
