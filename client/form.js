var validateFormdata = require('validate-formdata')
var parse = require('fast-json-parse')
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

  validator.field('address', function (address) {
    var fileType = getFileType(address)
    state.form.selected = fileType
    var target = address.match(/[\w]+:\/{2}([\w.-_]+)/)
    if (target && target.length >= 2) target = target[1]
    if (!fileType) return new Error('Address should have a valid file type prefix')
    if (!target) return new Error('An address should have both a protocol and a target')
  })

  validator.field('token', function (data) {
    if (!data || !data.length) return new Error('A token should be provided')
  })

  validator.file('image', { required: false }, function (data) {
    if (data === null) return // allow file to be reset
    if (!(data instanceof window.File)) return new Error('Please upload a file')
    var extension = data.name.match(/\.[\w\d]+$/)
    if (!extension ||
      !extension.length ||
      (extension[1] !== '.tgz' || extension[1] !== '.tar.gz')) {
      return new Error('Expected a .tgz archive to be uploaded')
    }
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
        if (res.statusCode >= 400) return emitter.emit('log:error', res)

        var json = parse(body)
        if (json.err) return emitter.emit('log:error', new Error('Could not parse body response'))
        else json = json.value

        if (!json.token) return emitter.emit('log:error', new Error('Expected json.token to exist'))
        emitter.emit(state.events.SSE_LAUNCH_DOCUMENT, json.token)
      })
    })

    emitter.on(state.events.FORM_SET_EXAMPLE_DOCUMENT, function () {
      validator.validate('address', 'github://stencila/examples/diamonds')
      render()
    })

    emitter.on(state.events.FORM_UPDATE, function (event) {
      var value = event.value
      var key = event.key

      validator.validate(key, value)
      if (key === 'image') {
        validator.validate('address', 'file://' + value.name)
      }
      if (validator.changed) render()
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
