var html = require('choo/html')
var css = require('sheetify')

var events = require('./events')

css`
  .terminal-white { color: #ddd }
  .terminal-red { color: #ff7b7b }
`

module.exports = mainView

function mainView (state, emit) {
  const formState = state.form
  const form = html`
    <form class="pt4 flex flex-column align-right" onsubmit=${onsubmit}>
      <label class="f4 b" for="address">
        Document address
      </label>
      <input name="address"
        type="text"
        class="mt2 pa2 f5 b--black"
        value=${formState.address}
        onchange=${onchange}
        placeholder="For example github://octocat/spoon-knife">
      <span class="mt2 lh-copy">
        Enter the document address. Is this your first time? See the <a href="">docs</a> or 
        <button class="bn bg-white pointer pa0 ma0 link underline" onclick=${tryExample}>
          try an example
        </button>
      </span>
      <label class="f4 b mt3" for="token">
        Beta token
      </label>
      <input name="token"
        type="text"
        class="mt2 pa2 f5 b--black"
        value=${formState.token}
        onchange=${onchange}
        placeholder="Token">
      <span class="mt2 lh-copy">
        During the beta, you need to provide a beta token.
      </span>
      <input type="submit"
        class="mw4 mt4 mh0 bg-white f5 b--black pa2 link pointer"
        value="Build">
    </form>
  `

  var header = html`
    <header class="w-100">
      <main class="flex flex-column mw7 pa3 pa4-ns center items-end">
        <a class="black f4" href="http://sibyl.surge.sh/">Docs</a>
        <a class="black f4" href="https://community.stenci.la/">Help</a>
      </main>
    </header>
  `

  return html`
    <body class="sans-serif pb3">
      ${header}
      <main class="flex flex-column mw7 pa3 center">
        <section class="flex flex-column justify-between content-stretch">
          <section class="w-100">
            ${form}
          </section>
          <section class="cf content-stretch mt3 mt5-ns">
            ${createSummary(state, emit)}
            ${createTerminal(state, emit)}
          </section>
        </section>
      </main>
    </body>
  `

  function onchange (e) {
    if (e.key === 'Enter') return onsubmit()
    var id = e.target.id
    var val = e.target.value
    // emit('form:update-' + id, val)

    // FIX(NB): `form:update-` wasn't around at time of writing
    state.form[e.target.name] = e.target.value
  }

  function onsubmit (e) {
    if (e) e.preventDefault()
    emit(events.LAUNCH_DOCUMENT)
  }

  function tryExample (e) {
    e.preventDefault()
    emit(events.SET_EXAMPLE_DOCUMENT)
  }
}

function createSummary (state, emit) {
  if (!state.sse.log.length) return html`<div class="fl"></div>`

  var button
  if (state.sse.url) {
    button = html`
      <a href=${state.sse.url}
        class="mh0 pa2 f5 ba bw1 bg-green white b--green link pointer"
        data-no-routing
        target="_blank">
        Open document
      </a>
    `
  } else {
    button = html`
      <a class="mh0 bg-gray f5 ba bw1 b--gray pa2 link white">
        Open document
      </a>
    `
  }

  return html`
    <div class="fl w-100 w-40-ns mt4 mt0-ns">
      <h2 class="f4 mv2 mt0-ns mb3-ns">
        Progress
      </h2>
      <div class="flex">
        <p class="mv0">
          <b class="f4 f3-ns">${state.sse.stdout}</b>
          <p class="f5 mt2">Lines</p>
        </p>
        <p class="mv0 ml4">
          <b class="f4 f3-ns">${state.sse.stderr}</b>
          <p class="f5 mt2">Errors</p>
        </p>
      </div>
      <div class="mt2 mt3-ns">
        ${button}
      </div>
    </div>
  `
}

function createTerminal (state, emit) {
  if (!state.sse.log.length) return html`<div></div>`

  return html`
    <div class="fl w-100 w-60-ns mt3 mt0-ns pl5-ns">
      <h2 class="f4 mv2 mt0-ns mb3-ns">
        Console
      </h2>
      <details>
        <summary>Show logs</summary>
        <div class="bg-black pa3 f6 pre">
          ${state.sse.log.map(function (event) {
            var className
            if (event.type === 'stdout') className = 'terminal-white'
            else if (event.type === 'stderr') className = 'terminal-red'
            return html`
              <pre class="${className} ma0 lh-copy">
                ${event.data}
              </pre>`
          })}
        </div>
      </details>
    </div>
  `
}
