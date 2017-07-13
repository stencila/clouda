var parse = require('fast-json-parse')
var onIdle = require('on-idle')
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
  state.events.FORM_UPDATE = 'form:update'
  state.events.FORM_SUBMIT = 'form:submit'
  state.events.FORM_SET = 'form:set'

  state.form = {
    clock: 0,
    values: {},
    selected: null,
    providers: providerNames
  }

  // Set a default value for the form during development
  if (process.env.NODE_ENV !== 'production') {
    state.form.values.token = 'platypus'
  }

  emitter.on('DOMContentLoaded', function () {
    // Read the current path location and set it as the address
    if (state.params.wildcard) {
      state.form.values.address = state.params.wildcard
      render()
    }

    emitter.on(state.events.FORM_SUBMIT, function (formData) {
      onIdle(function () {
        xhr.post('/~launch', { body: formData }, function (err, res, body) {
          if (err) return emitter.emit('log:error', err)
          if (res.statusCode >= 400) return emitter.emit('log:error', res)

          var json = parse(body)
          if (json.err) return emitter.emit('log:error', new Error('Could not parse body response'))
          else json = json.value

          if (!json.token) return emitter.emit('log:error', new Error('Expected json.token to exist'))
          emitter.emit(state.events.SSE_LAUNCH_DOCUMENT, json.token)
        })
      })
    })

    emitter.on(state.events.FORM_UPDATE, function (event) {
      if (event.type === 'file') {
        state.form.values[event.key] = event.value
        state.form.values.address = 'file://' + event.value.name
        state.form.selected = 'file'
        render()
      } else {
        var oldType = state.form.selected
        var newType = getFileType(event.value)
        state.form.values[event.key] = event.value
        if (oldType !== newType) {
          state.form.selected = newType
          render()
        }
      }
    })

    emitter.on(state.events.FORM_SET, function (event) {
      var oldType = state.form.selected
      var newType = getFileType(event.value)
      state.form.values[event.key] = event.value
      if (oldType !== newType) state.form.selected = newType
      render()
    })
  })

  function render () {
    state.form.clock += 1
    emitter.emit('render')
  }

  function getFileType (str) {
    if (typeof str !== 'string') return null
    var type = str.split('://')
    if (type.length !== 2) return
    type = type[0]
    var index = providerNames.indexOf(type)
    if (index !== -1) return providerNames[index]
    else return null
  }
}
