const Koa = require('koa')
const KoaRouter = require('koa-router')
const send = require('koa-send')
const PassThrough = require('stream').PassThrough;
const path = require('path')
const spawn = require('child_process').spawn

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
  const sibyl = spawn('sibyl', ['launch', address])
  sibyl.stdout.on('data', data => {
    sse.write(`event: stdout\ndata: ${data.toString().replace('\n','\\n')}\n\n`)
  })
  sibyl.stderr.on('data', data => {
    sse.write(`event: stderr\ndata: ${data.toString().replace('\n','\\n')}\n\n`)
  })
  sibyl.on('exit', code => {
    if (code == 0) {
      sse.write(`event: goto\ndata: /${address}!html\n\n`)
    } else {
      sse.write(`event: end\ndata: ${code}\n\n`)
    }
    ctx.res.end()
  })
})

// Document page
router.get(/\/.+?!html/, async ctx => {
  const address = ctx.path.match(/\/(.+?)!html/)[1]
  // This encodes the address into a safe name
  // it relies on this encoding being the same as in the `sibyl` Bash script
  const name = address.replace(/:/g,'-').replace(/\//g,'-')
  await send(ctx, `folders/${name}/stencila.html`)
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
console.log('Listening on port http://127.0.0.1:3000');
