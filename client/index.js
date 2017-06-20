const css = require('sheetify')
const choo = require('choo')

const events = require('./events')

css('tachyons')

const app = choo()
if (process.env.NODE_ENV !== 'production') {
  app.use(require('choo-log')())
}

app.use(require('./sse'))

// form state
app.use(function (state, emitter) {
  state.form = {
    address: ''
  }

  emitter.on('DOMContentLoaded', function () {
    emitter.on(events.SET_EXAMPLE_NOTEBOOK, function () {
      state.form.address = 'github.com://octocat/spoon-knife'
      emitter.emit('render')
    })
  })
})

app.route('/', require('./view-main'))
app.mount('body')
