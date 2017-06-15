const Koa = require('koa')
const KoaRouter = require('koa-router')
const send = require('koa-send')
const jwt = require('jsonwebtoken')
const PassThrough = require('stream').PassThrough
const path = require('path')
const spawn = require('child_process').spawn

const TOKEN_SECRET = 'TODO: set a secret'

const app = new Koa()
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
  const sse = new PassThrough()
  ctx.type = 'text/event-stream'
  ctx.body = sse
  // Remove timeout on the request
  ctx.req.setTimeout(0)

  // Launch `sibyl` Bash script and send output
  // and errors as SSE events until it exits
  const address = ctx.path.substring(9)
  const mock = (typeof ctx.request.query.mock !== 'undefined') ? '--mock' : ''
  const sibyl = spawn('./sibyl.sh', ['launch', address, mock])
  sibyl.stdout.on('data', data => {
    for (let line of data.toString().split('\n')) {
      if (line.length) {
        const goto_ = line.match(/^GOTO (.+)$/)
        if (goto_) {
          // The internal IP that the client needs to go to
          // to connect with their container
          const ip = goto_[1]
          // Put the IP in a token
          const token = jwt.sign({
            ip: ip
          }, TOKEN_SECRET, { expiresIn: '1h' });
          // Tell client to GOTO session URL
          const url = `/~session/${token}`
          sse.write(`event: goto\ndata: ${url}\n\n`)
        } else {
          sse.write(`event: stdout\ndata: ${line}\n\n`)
        }
      }
    }
  })
  sibyl.stderr.on('data', data => {
    for (let line of data.toString().split('\n')) {
      sse.write(`event: stderr\ndata: ${line}\n\n`)
    }
  })
  sibyl.on('exit', code => {
    sse.write(`event: end\ndata: ${code}\n\n`)
    ctx.res.end()
  })
})

// Connect to the launched container
router.get('/~session/*', async ctx => {
  // Get the token
  const token = ctx.path.substring(8)
  jwt.verify(token, TOKEN_SECRET, (error, payload) => {
    if (error) {
      ctx.body = 'Auth error'
    } else {
      ctx.header = 'X-Accel_Redirect'  //TODO
      console.log(payload)
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

app.use(router.routes())

app.listen(3000)
console.log('Listening at http://127.0.0.1:3000')
