module.exports = form

function form (state, emitter) {
  state.events.FORM_SET_EXAMPLE_DOCUMENT = 'form:set-example-document'
  state.events.FORM_UDPATE_ADDRESS = 'form:update-address'
  state.events.FORM_UPDATE_TOKEN = 'form:update-token'

  state.form = {
    address: '',
    token: ''
  }

  emitter.on('DOMContentLoaded', function () {
    if (state.params.wildcard) {
      state.form.address = state.params.wildcard
      emitter.emit('render')
    }

    emitter.on(state.events.FORM_SET_EXAMPLE_DOCUMENT, function () {
      state.form.address = 'github://stencila/examples/diamonds'
      emitter.emit('render')
    })

    emitter.on(state.events.FORM_UDPATE_ADDRESS, function (address) {
      state.form.address = address
    })

    emitter.on(state.events.FORM_UPDATE_TOKEN, function (token) {
      state.form.token = token
    })
  })
}
