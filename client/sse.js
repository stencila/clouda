var assert = require('assert')
var events = require('./events')

module.exports = sse

function sse (state, emitter) {
  state.sse = {
    log: [],
    url: '',
    stderr: 0,
    stdout: 0
  }

  emitter.on('DOMContentLoaded', function () {
    emitter.on(events.LAUNCH_NOTEBOOK, function (address) {
      assert.equal(typeof address, 'string', events.LAUNCH_NOTEBOOK + ': address should be type string')

      const eventSource = new window.EventSource('/~launch/' + address)

      eventSource.addEventListener('stdout', function (event) {
        state.sse.log.push({ type: 'stdout', data: event.data })
        state.sse.stdout += 1
        emitter.emit('render')
      }, false)

      eventSource.addEventListener('stderr', function (event) {
        state.sse.log.push({ type: 'stderr', data: event.data })
        state.sse.stderr += 1
        emitter.emit('render')
      }, false)

      eventSource.addEventListener('goto', function (event) {
        state.sse.url = '/~session/' + event.data + '/'
        emitter.emit('render')
      }, false)

      eventSource.addEventListener('end', function (event) {
        eventSource.close()
      }, false)

      eventSource.onerror = function (event) {
        emitter.emit('log:error', event)
        eventSource.close()
      }
    })
  })
}
