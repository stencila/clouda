module.exports = embed

function embed (state, emitter) {
  state.events.EMBED_UPDATE = 'embed:update'

  state.embed = {
    frozen: false,
    url: createUrl(false)
  }

  emitter.on('DOMContentLoaded', function () {
    emitter.on(state.events.EMBED_UPDATE, function (value) {
      state.embed.frozen = value
      state.embed.url = createUrl(value)
      emitter.emit('render')
    })
  })

  function createUrl (frozen) {
    return frozen
      ? `${window.location.origin}/image://${state.sse.image}`
      : `${window.location.origin}/${state.form.address}`
  }
}
