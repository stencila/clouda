var validateFormdata = require('validate-formdata')
var nanobounce = require('nanobounce')

module.exports = form

function form (state, emitter) {
  state.events.FORM_SET_EXAMPLE_DOCUMENT = 'form:set-example-document'
  state.events.FORM_UPDATE = 'form:update'

  var validator = validateFormdata()
  state.form = validator.state

  // TODO: fix this in validat-formdata
  state.form.values.address = ''
  state.form.values.token = ''

  if (process.env.NODE_ENV !== 'production') {
    state.form.values.token = 'platypus'
  }

  validator.add('address', function (data) {
    // TODO: write validation code
  })

  validator.add('token', function (data) {
    // TODO: write validation code
  })

  emitter.on('DOMContentLoaded', function () {
    if (state.params.wildcard) {
      state.form.address = state.params.wildcard
      emitter.emit('render')
    }

    emitter.on(state.events.FORM_SET_EXAMPLE_DOCUMENT, function () {
      state.form.values.address = 'github://stencila/examples/diamonds'
      emitter.emit('render')
    })

    var bounce = nanobounce()
    emitter.on(state.events.FORM_UPDATE, function (e) {
      validator.validate(e.target.name, e.target.value)

      bounce(function () {
        emitter.emit('render')
      })
    })
  })
}
