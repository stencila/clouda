var html = require('choo/html')
var css = require('sheetify')

css`
  .terminal-white { color: #333 }
  .terminal-red { color: #ff7b7b }
`

module.exports = mainView

function mainView (state, emit) {
  const formState = state.form
  const form = html`
    <form class="flex flex-column align-right" onsubmit=${onsubmit}>
      <label class="f4 b" for="address">
        Document address
      </label>
      <input name="address" type="text" aria-label="address"
        class="mt2 pa2 f5 b--black"
        value=${formState.values.address}
        onchange=${onchange}
        onkeyup=${onchange}
        placeholder="For example, github://stencila/examples/diamonds">
      <span class="mt2 lh-copy">
        Enter the document address. Is this your first time? See the
        <a class="bn black pointer link underline" href="http://sibyl.surge.sh/" data-no-routing target="_blank">docs</a>
        or
        <button class="bn bg-white pointer pa0 ma0 link underline" onclick=${tryExample}>
          try an example
        </button>
      </span>
      <label class="f4 b mt3" for="token">
        Beta token
      </label>
      <input name="token" type="text" aria-label="token"
        class="mt2 pa2 f5 b--black"
        value=${formState.values.token}
        onchange=${onchange}
        onkeyup=${onchange}
        placeholder="Token">
      <span class="mt2 lh-copy">
        During the beta, you need to provide a beta token.
      </span>
      <input type="submit" aria-label="open"
        class="mw4 mt2 mh0 bg-white f5 b--black pa2 link pointer"
        value="Open">
    </form>
  `

  var header = html`
    <header class="w-100">
      <section class="flex flex-column flex-row-ns mw7 pa3 center items-end justify-end">
        <a class="black f4" href="http://sibyl.surge.sh/">
          Docs
        </a>
        <a class="black f4 mt2 mt0-ns ml0 ml3-ns" href="https://community.stenci.la/">
          Help
        </a>
      </section>
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
    emit(state.events.FORM_UPDATE, e)
  }

  function onsubmit (e) {
    if (e) e.preventDefault()
    // TODO: replace with full on form validation
    emit(state.events.FORM_SUBMIT)
  }

  function tryExample (e) {
    e.preventDefault()
    emit(state.events.FORM_SET_EXAMPLE_DOCUMENT)
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
    var percent = state.sse.percent

    return html`
      <div class="w-100 mt4">
        <h3 class="f4 b mt3" for="token">
          Progress
        </h3>
        <div class="bg-gray" style="width: ${percent}%; height: 2em"></div>
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
  if (!state.sse.image) return

  var frozen = state.embed.frozen
  var url = state.embed.url

  return html`
    <details class="w-100 mt4">
      <summary>Embed</summary>
      <p>Put a "Open in Stencila" button in your document</p>
      <form>
        <label>
          <input type="radio" name="frozen"
            value="no"
            ${!frozen ? 'checked' : ''}
            onclick=${emit.bind(emit, state.events.EMBED_UPDATE, false)}
          />
          Unfrozen link to latest version
        </label>
        <label>
          <input type="radio" name="frozen"
            value="yes"
            ${frozen ? 'checked' : ''}
            onclick=${emit.bind(emit, state.events.EMBED_UPDATE, true)}
          />
          Frozen link to current version
        </label>
      </form>
      <h4>Markdown</h4>
      <pre class="pre">[Open in Stencila](${url})</pre>
      <h4>HTML</h4>
      <pre class="pre">&lt;a href="${url}"&gt;Open in Stencila&lt;/a&gt;</pre>
    </details>
  `
}
