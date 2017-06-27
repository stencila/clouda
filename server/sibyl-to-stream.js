const eos = require('end-of-stream')
const jwt = require('jsonwebtoken')

module.exports = sibylToStream

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
        const match = line.match(/^(STEP|IMAGE|GOTO) (.+)$/)
        if (match) {
          let type = match[1]
          let data = match[2]
          if (type === 'STEP') {
            ctx.log.debug('SSE: sending step')
            res.write(`event: step\ndata: ${data}\n\n`)
          } else if (type === 'IMAGE') {
            ctx.log.debug('SSE: sending image')
            res.write(`event: image\ndata: ${data}\n\n`)
          } else if (type === 'GOTO') {
            const token = jwt.sign({ url: data }, ctx.env.TOKEN_SECRET, { expiresIn: '12h' })
            ctx.log.debug('SSE: sending stdout goto')
            res.write(`event: goto\ndata: ${token}\n\n`)
          }
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
