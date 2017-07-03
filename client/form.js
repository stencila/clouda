var validateFormdata = require('validate-formdata')
var nanobounce = require('nanobounce')
var assert = require('assert')
var xhr = require('xhr')

module.exports = form

function form (state, emitter) {
  state.events.FORM_SET_EXAMPLE_DOCUMENT = 'form:set-example-document'
  state.events.FORM_UPDATE = 'form:update'
  state.events.FORM_SUBMIT = 'form:submit'

  var validator = validateFormdata()
  state.form = validator.state
  state.form.clock = 0

  // TODO: fix this in validat-formdata
  state.form.values.address = ''
  state.form.values.token = ''

  validator.add('address', function (data) {
    // TODO: write validation code
  })

  validator.add('token', function (data) {
    // TODO: write validation code
  })

  emitter.on('DOMContentLoaded', function () {
    // Set a default value for the form during development
    if (process.env.NODE_ENV !== 'production') {
      validator.validate('token', 'platypus')
      render()
    }

    // Read the current path location and set it as the address
    if (state.params.wildcard) {
      validator.validate('address', state.params.wildcard)
      render()
    }

    emitter.on(state.events.FORM_SUBMIT, function () {
      assert.ok(state.form.valid, 'form submitted without being valid')
      var opts = { body: validator.formData() }
      xhr.post('/~launch', opts, function (err, res, body) {
        if (err) return emitter.emit('log:error', err)
        if (!body && !body.token) {
          return emitter.emit('log:error', new Error('No response body found'))
        }

        try {
          body = JSON.parse(body)
        } catch (e) {
          return emitter.emit('log:error', new Error('Could not parse body response'))
        }
        emitter.emit(state.events.SSE_LAUNCH_DOCUMENT, body.token)
      })
    })

    emitter.on(state.events.FORM_SET_EXAMPLE_DOCUMENT, function () {
      validator.validate('address', 'github://stencila/examples/diamonds')
      render()
    })

    var bounce = nanobounce()
    emitter.on(state.events.FORM_UPDATE, function (e) {
      validator.validate(e.target.name, e.target.value)

      bounce(render)
    })
  })

  function render () {
    state.form.clock += 1
    emitter.emit('render')
  }
}
