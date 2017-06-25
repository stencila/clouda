const css = require('sheetify')
const choo = require('choo')

const events = require('./events')

css('tachyons')

const app = choo()
if (process.env.NODE_ENV !== 'production') {
  app.use(require('choo-expose')())
  app.use(require('choo-log')())
}

app.use(require('./sse'))

// form state
app.use(function (state, emitter) {
  state.form = {
    address: '',
    token: ''
  }

  emitter.on('DOMContentLoaded', function () {
    emitter.on(events.SET_EXAMPLE_DOCUMENT, function () {
      state.form.address = 'github://stencila/examples/diamonds'
      emitter.emit('render')
    })

    emitter.on('form:update-address', function (address) {
      state.form.address = address
    })

    emitter.on('form:update-token', function (token) {
      state.form.token = token
    })
  })
})

// Embedding buttons
app.use(function (state, emitter) {
  state.embed = {
    frozen: false
  }

  emitter.on('DOMContentLoaded', function () {
    emitter.on('embed:update-frozen', function (value) {
      state.embed.frozen = value
      emitter.emit('render')
    })
  })
})

app.route('/', require('./view-main'))
app.mount('body')
