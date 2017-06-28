module.exports = sse

function sse (state, emitter) {
  state.events.SSE_LAUNCH_DOCUMENT = 'sse:launch-document'

  state.sse = reset()

  emitter.on('DOMContentLoaded', function () {
    emitter.on(state.events.LAUNCH_DOCUMENT, function () {
      const address = state.form.address + '?token=' + state.form.token
      const eventSource = new window.EventSource('/~launch/' + address)

      state.sse = reset()

      eventSource.addEventListener('stdout', function (event) {
        state.sse.log.push({ type: 'stdout', data: event.data })
        state.sse.percent = updateProgress()
        state.sse.stdout += 1
        emitter.emit('render')
      }, false)

      eventSource.addEventListener('stderr', function (event) {
        state.sse.log.push({ type: 'stderr', data: event.data })
        state.sse.percent = updateProgress()
        state.sse.stderr += 1
        emitter.emit('render')
      }, false)

      eventSource.addEventListener('step', function (event) {
        state.sse.step = event.data
        emitter.emit('render')
      }, false)

      eventSource.addEventListener('image', function (event) {
        state.sse.image = event.data
        emitter.emit('render')
      }, false)

      eventSource.addEventListener('goto', function (event) {
        state.sse.url = '/~session/' + event.data + '/~'
        state.sse.percent = updateProgress()
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

  function updateProgress () {
    return state.sse.url
      ? 100
      : Math.min(state.sse.log.length / 20 * 100, 80)
  }

  function reset () {
    return {
      log: [],
      step: null,
      image: null,
      url: '',
      stderr: 0,
      stdout: 0,
      percent: 0
    }
  }
}
