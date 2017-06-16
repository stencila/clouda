const eos = require('end-of-stream')
const http = require('http')
const jwt = require('jsonwebtoken')
const Koa = require('koa')
const KoaRouter = require('koa-router')
const logHttp = require('log-http')
const send = require('koa-send')
const jwt = require('jsonwebtoken')
const path = require('path')
const pino = require('pino')
const spawn = require('child_process').spawn
const stream = require('stream')

const PORT = 3000

// JWT token secret should be set as an environment variable
// Should we enforce that (including during development) and never have this default here?
const TOKEN_SECRET = 'THIS SECRET SHOULD BE SET AS A ENV VAR'

// Used to dertmine the mechanism for redirecting to container session
// Is there a better way to do this? Determine automatically?
const BEHIND_NGINX = false


const TOKEN_SECRET = 'TODO: set a secret'

const app = new Koa()
const log = pino({ level: 'debug', name: 'sibyl' }, process.stdout)
const router = new KoaRouter()

// Static content in `client` folder
router.get('/~client/*', async ctx => {
  await send(ctx, path.join('client', ctx.path.substring(8)))
})

// Launch stream.
//
// Runs the `sibyl` Bash script and creates a server send event stream of it's output which is displayed
// by `client.js`.
// See https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
router.get('/~launch/*', ctx => {
  // Use a PassThrough stream as the response body
  // to write Server Sent Events
  const sse = new stream.PassThrough()
  ctx.type = 'text/event-stream'
  // Prevent nginx from buffering the stream
  if (BEHIND_NGINX) {
    ctx.set('X-Accel-Buffering', 'no')
  }
  ctx.body = sse
  // Remove timeout on the request
  ctx.req.setTimeout(0)

  // Launch `sibyl` Bash script and send output
  // and errors as SSE events until it exits
  const address = ctx.path.substring(9)
  const mock = (typeof ctx.request.query.mock !== 'undefined') ? '--mock' : ''
  const sibyl = spawn('./sibyl.sh', ['launch', address, mock])
  sibylToStream(sibyl, sse, ctx)
})

// Connect to the launched container
router.get('/~session/*', async ctx => {
  // Get the token
  const token = ctx.path.substring(10)
  jwt.verify(token, TOKEN_SECRET, (error, payload) => {
    if (error) {
      ctx.status = 403
    } else {
      const url = payload.url
      if (BEHIND_NGINX) {
        ctx.status = 200
        ctx.set('X-Accel-Redirect', `/internal-session/${url}`)
      } else {
        ctx.status = 301
        ctx.set('Location', url)
      }
    }
  })
})


// Launch page
router.get(/\/.+/, async ctx => {
  await send(ctx, 'client/launch.html')
})

// Home page
router.get('/', async ctx => {
  await send(ctx, 'client/index.html')
})

// Start listening & attach http logger
app.use(router.routes())
const server = http.createServer(app.callback())
const stats = logHttp(server)
stats.on('data', function (level, data) {
  log[level](data)
})
server.listen(PORT, function () {
  log.info('Listening at http://127.0.0.1:' + PORT)
})

// Safely forward the sibyl script into a stream of messages
// Connects the sibyl child process, a write stream and a koa context
function sibylToStream (sibyl, sink, ctx) {
  var closed = false

  sibyl.stdout.on('data', onStdout)
  sibyl.stderr.on('data', onStderr)
  sibyl.on('exit', onExit)

  eos(ctx.res, function (err) {
    if (err) log.error(err)
    log.debug('closing SSE stream')
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
          const token = jwt.sign({ url: url }, TOKEN_SECRET, { expiresIn: '1h' })
          log.debug('SSE: sending stdout goto')
          sink.write(`event: goto\ndata: ${token}\n\n`)
        } else {
          log.debug('SSE: sending stdout data')
          sink.write(`event: stdout\ndata: ${line}\n\n`)
        }
      }
    }
  }

  function onStderr (data) {
    if (closed) return
    for (let line of data.toString().split('\n')) {
      log.debug('SSE: sending stderr data')
      sink.write(`event: stderr\ndata: ${line}\n\n`)
    }
  }

  function onExit (data) {
    if (closed) return
    log.debug('SSE: sending end event')
    sink.write(`event: end\ndata: ${data}\n\n`)
  }
}
