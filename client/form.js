var validateFormdata = require('validate-formdata')
var nanobounce = require('nanobounce')
var assert = require('assert')
var xhr = require('xhr')

var providerNames = [
  'bitbucket',
  'dat',
  'docker',
  'dropbox',
  'file',
  'github',
  'gitlab'
]

module.exports = form

function form (state, emitter) {
  state.events.FORM_SET_EXAMPLE_DOCUMENT = 'form:set-example-document'
  state.events.FORM_UPDATE = 'form:update'
  state.events.FORM_SUBMIT = 'form:submit'

  var validator = validateFormdata()
  state.form = validator.state
  state.form.fileType = null
  state.form.selected = null
  state.form.clock = 0

  // TODO: fix this in validate-formdata
  state.form.values.address = ''
  state.form.values.token = ''

  validator.add('address', function (data) {
    state.form.selected = getFileType(data)
    // TODO: write validation code
  })

  validator.add('token', function (data) {
    // TODO: write validation code
  })

  // TODO: fix this in validate-formdata
  state.form.pristine.image = false
  validator.add('image', function (data) {
    // TODO: write validation code
  })

  // Set a default value for the form during development
  if (process.env.NODE_ENV !== 'production') {
    validator.validate('token', 'platypus')
  }

  emitter.on('DOMContentLoaded', function () {
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
    emitter.on(state.events.FORM_UPDATE, function (event) {
      var value = event.value
      var key = event.key

      validator.validate(key, value)
      if (key === 'image') {
        validator.validate('address', 'file://' + value.name)
      }

      bounce(render)
    })
  })

  function render () {
    state.form.clock += 1
    emitter.emit('render')
  }
}

function getFileType (str) {
  var type = str.split('://')
  if (type.length !== 2) return
  type = type[0]
  var index = providerNames.indexOf(type)
  if (index !== -1) return providerNames[index]
  else return null
}
