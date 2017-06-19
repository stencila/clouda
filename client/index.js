const choo = require('choo')

const app = choo()
if (process.env.NODE_ENV !== 'production') {
  app.use(require('choo-log')())
}

app.use(sse)

app.route('/', require('./view-main'))
app.mount('body')

function sse (state, emitter) {
  const address = window.location.pathname.substring(1)
  const query = window.location.search
  const eventSource = new window.EventSource('/~launch/' + address + query)

  const terminal = document.createElement('div')
  terminal.className = 'terminal'
  document.getElementsByTagName('body')[0].appendChild(terminal)

  eventSource.addEventListener('stdout', function (event) {
    const pre = document.createElement('pre')
    pre.className = 'stdout'
    pre.innerHTML = event.data
    terminal.appendChild(pre)
  }, false)

  eventSource.addEventListener('stderr', function (event) {
    const pre = document.createElement('pre')
    pre.className = 'stderr'
    pre.innerHTML = event.data
    terminal.appendChild(pre)
  }, false)

  eventSource.addEventListener('goto', function (event) {
    // Get the token
    const token = event.data

    const div = document.createElement('div')
    div.className = 'goto'
    div.innerHTML = '<a href="/~session/' + token + '/" target="_blank">Click here to open container</a>'
    document.getElementsByTagName('body')[0].appendChild(div)
  }, false)

  eventSource.addEventListener('end', function (event) {
    const div = document.createElement('div')
    div.className = 'end'
    document.getElementsByTagName('body')[0].appendChild(div)

    eventSource.close()
  }, false)

  eventSource.onerror = function (event) {
    console.error(event)
    eventSource.close()
  }
}
