const spawn = require('child_process').spawn
const alru = require('array-lru')
const jwt = require('jsonwebtoken')
const stream = require('stream')
const uuid = require('uuid')

// Create an LRU object that can hold up to 30 streams. Destroyed once evicted
// to prevent memory leaking
const lru = alru(30, {
  evict: function (index, stream) {
    stream.destroy()
  }
})

module.exports = Sibyl

function Sibyl (log) {
  if (!(this instanceof Sibyl)) return new Sibyl(log)
  this.log = log
}

Sibyl.prototype.get = function (id) {
  return lru.get(id)
}

// TODO: make sure the tokens are validated
Sibyl.prototype.launch = function (address, opts) {
  opts = opts || {}

  var closed = false
  const self = this

  const mock = opts.mock ? '--mock' : ''
  const sibyl = spawn('./sibyl.sh', ['launch', address, mock])
  const pts = new stream.PassThrough()

  sibyl.stdout.on('data', onStdout)
  sibyl.stderr.on('data', onStderr)
  sibyl.on('exit', onExit)

  const id = uuid()
  lru.set(id, pts)

  return id

  function onStdout (data) {
    if (closed) return
    for (let line of data.toString().split('\n')) {
      if (line.length) {
        const match = line.match(/^(STEP|IMAGE|GOTO) (.+)$/)
        if (match) {
          let type = match[1]
          let data = match[2]
          if (type === 'STEP') {
            self.log.debug('SSE: sending step')
            pts.write(`event: step\ndata: ${data}\n\n`)
          } else if (type === 'IMAGE') {
            self.log.debug('SSE: sending image')
            pts.write(`event: image\ndata: ${data}\n\n`)
          } else if (type === 'GOTO') {
            const token = jwt.sign({ url: data }, process.env.TOKEN_SECRET, { expiresIn: '12h' })
            self.log.debug('SSE: sending stdout goto')
            pts.write(`event: goto\ndata: ${token}\n\n`)
          }
        } else {
          self.log.debug('SSE: sending stdout data')
          pts.write(`event: stdout\ndata: ${line}\n\n`)
        }
      }
    }
  }

  function onStderr (data) {
    if (closed) return
    for (let line of data.toString().split('\n')) {
      self.log.debug('SSE: sending stderr data')
      pts.write(`event: stderr\ndata: ${line}\n\n`)
    }
  }

  function onExit (data) {
    if (closed) return
    self.log.debug('SSE: sending end event')
    pts.write(`event: end\ndata: ${data}\n\n`)
  }
}
