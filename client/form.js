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
      emitter.emit('render')
    }

    // Read the current path location and set it as the address
    if (state.params.wildcard) {
      validator.validate('address', state.params.wildcard)
      emitter.emit('render')
    }

    emitter.on(state.events.FORM_SUBMIT, function () {
      assert.ok(state.form.valid, 'form submitted without being valid')
      var opts = { body: validator.formData() }
      xhr.post('/~launch', opts, function (err, res, body) {
        if (err) console.error('err', err)
        console.log('OK', body)
      })
    })

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
