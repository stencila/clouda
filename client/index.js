const css = require('sheetify')
const choo = require('choo')

css('tachyons')

const app = choo()
if (process.env.NODE_ENV !== 'production') {
  app.use(require('choo-expose')())
  app.use(require('choo-log')())
}

app.use(require('./sse'))     // parse logs from containers
app.use(require('./form'))    // submit things to the server
app.use(require('./embed'))   // markdown embed logic

app.route('/', require('./view-main'))
app.route('/*', require('./view-main'))
app.mount('body')
