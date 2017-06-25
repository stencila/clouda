var html = require('choo/html')
var css = require('sheetify')

var events = require('./events')

css`
  .terminal-white { color: #333 }
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
        placeholder="For example, github://stencila/examples/diamonds">
      <span class="mt2 lh-copy">
        Enter the document address. Is this your first time? See the 
        <a class="bn bg-white pointer pa0 ma0 link underline" href="http://sibyl.surge.sh/" data-no-routing target="_blank">
          docs
        </a>
        or 
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
        value="Open">
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
          <section class="w-100">
            ${createProgress(state, emit)}
          </section>
          <section class="w-100">
            ${createLinks(state, emit)}
          </section>
        </section>
      </main>
    </body>
  `

  function onchange (e) {
    if (e.key === 'Enter') return onsubmit()
    var name = e.target.name
    var val = e.target.value
    emit('form:update-' + name, val)
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

function createProgress (state, emit) {
  if (!state.sse.log.length) return html`<div class="fl"></div>`

  return html`
    <div class="w-100">
      ${createProgress()}
      ${createLog()}
      ${createButton()}
    </div>
  `

  function createProgress () {
    var percent = state.sse.url ? 100 : Math.min(state.sse.log.length / 20 * 100, 80)
    return html`
      <div class="w-100 mt5">
        <h2 class="f4 mv2 mt0-ns mb3-ns">
          Progress
        </h2>
        <div class="bg-gray" style="width: ${percent}%; height: 2em">
        </div>
      </div>
    `
  }

  function createLog () {
    if (!state.sse.log.length) return html`<div></div>`

    return html`
      <details class="w-100 gray">
        <summary>Log</summary>
        <div class="f6 pre">
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
    `
  }

  function createButton () {
    var button
    if (state.sse.url) {
      button = html`
        <a href=${state.sse.url}
          class="mh0 pa2 f5 ba bw1 bg-green b--green link white pointer"
          data-no-routing
          target="_blank">
          View
        </a>
      `
    } else {
      button = html`
        <a class="w-20 mh0 pa2 f5 ba bw1 bg-gray b--gray link white">
          ${state.sse.step}ing
        </a>
      `
    }
    return html`
      <div class="mt4">
        ${button}
      </div>
    `
  }
}

function createLinks (state, emit) {
  if (state.sse.image) {
    let url
    if (state.embed.frozen) {
      url = `${window.location.origin}/image://${state.sse.image}`
    } else {
      url = `${window.location.origin}/${state.form.address}`
    }
    let frozen = state.embed.frozen
    return html`
      <div class="w-100 mt5">
        <h3>Embed</h3>
        <p>Put a "Open in Stencila" button in your document</p>
        <form>
          <label>
            <input type="radio" name="frozen" 
              value="no"
              ${!frozen ? 'checked' : ''}
              onclick=${event => emit('embed:update-frozen', false)} 
            />
            Unfrozen link to latest version
          </label>
          <label>
            <input type="radio" name="frozen" 
              value="yes" 
              ${frozen ? 'checked' : ''}
              onclick=${event => emit('embed:update-frozen', true)} 
            />
            Frozen link to current version
          </label>
        </form>
        <h4>Markdown</h4>
        <pre class="pre">[Open in Stencila](${url})</pre>
        <h4>HTML</h4>
        <pre class="pre">&lt;a href="${url}"&gt;Open in Stencila&lt;/a&gt;</pre>
      </div>
    `
  }
}
