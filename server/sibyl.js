const sibyl = require('stencila-sibyl')
const alru = require('array-lru')
const jwt = require('jsonwebtoken')
const stream = require('stream')
const uuid = require('uuid')

// Create an LRU object that can hold up to 30 streams. Destroyed once evicted
// to prevent memory leaking
const lru = alru(30, {
  evict: function (index, stream) {
    if (stream.destroy) stream.destroy()
    else stream.end()
  }
})

module.exports = Sibyl

function Sibyl (log) {
  if (!(this instanceof Sibyl)) return new Sibyl(log)
  this.log = log
}

Sibyl.prototype.get = function (id) {
  this.log.debug('connecting to stream', id)
  return lru.get(id)
}

// TODO: make sure the tokens are validated
Sibyl.prototype.open = function (address, opts) {
  opts = opts || {}

  var closed = false
  const self = this

  const source = new stream.PassThrough()
  const sink = new stream.PassThrough()

  sibyl('open', address, source, onExit)
  source.on('data', parseMessage)

  const id = uuid()
  lru.set(id, sink)

  return id

  function parseMessage (data) {
    if (closed) return
    for (let line of data.toString().split('\n')) {
      if (line.length) {
        const match = line.match(/^(STEP|IMAGE|GOTO) (.+)$/)
        if (match) {
          let type = match[1]
          let data = match[2]
          if (type === 'STEP') {
            self.log.debug('SSE: sending step')
            sink.write(`event: step\ndata: ${data}\n\n`)
          } else if (type === 'IMAGE') {
            self.log.debug('SSE: sending image')
            sink.write(`event: image\ndata: ${data}\n\n`)
          } else if (type === 'GOTO') {
            const token = jwt.sign({ url: data }, process.env.TOKEN_SECRET, { expiresIn: '12h' })
            self.log.debug('SSE: sending stdout goto')
            sink.write(`event: goto\ndata: ${token}\n\n`)
          }
        } else {
          self.log.debug('SSE: sending stdout data', line)
          sink.write(`event: stdout\ndata: ${line}\n\n`)
        }
      }
    }
  }

  function onExit (data) {
    if (closed) return
    self.log.debug('SSE: sending end event')
    sink.write(`event: end\ndata: ${data}\n\n`)
  }
}
