var html = require('choo/html')
var css = require('sheetify')

var progress = require('./progress-element')()
var form = require('./form-element')()

css`
  .terminal-white { color: #333 }
  .terminal-red { color: #ff7b7b }
`

module.exports = mainView

function mainView (state, emit) {
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
            ${form.render(state, emit)}
          </section>
          <section class="w-100">
            ${progress.render(state, emit)}
          </section>
          <section class="w-100">
            ${createLinks(state, emit)}
          </section>
        </section>
      </main>
    </body>
  `
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
