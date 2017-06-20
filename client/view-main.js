var html = require('choo/html')
var assert = require('assert')
var css = require('sheetify')

var events = require('./events')

css('tachyons')

css`
  .terminal {
    margin: 0 auto;
    max-width: 40em;
    background: #222;
    border-radius: 3px;
    padding: 1em;
  }

  .terminal pre {
    white-space: pre-wrap;
  }

  .stdout {
    color: #ddd;
  }

  .stderr {
    color: #ff7b7b;
  }
`

module.exports = mainView

function mainView (state, emit) {
  const formState = state.form
  const form = html`
    <form class="pt5 flex flex-column align-right" onsubmit=${onsubmit}>
      <label class="f4 b" for="address">
        Address
      </label>
      <input type="text"
        class="mt2 pa2 f5 b--black" id="address"
        value=${formState.address}
        placeholder="For example github://octocat/spoon-knife">
      <span class="mt2 lh-copy">
        Run a repository containing a notebook. Is this your first time?
        <button class="bn bg-white pointer pa0 ma0 link underline" onclick=${tryExample}>
          Try an example
        </button>
      </span>
      <input type="submit"
        class="mw4 mt4 mh0 bg-white f5 b--black pa2 link pointer"
        value="Run notebook">
    </form>
  `

  return html`
    <body class="sans-serif">
      <main class="flex flex-column mw7 pa3 center">
        <section>
          <h1 class="f-subheadline ma0 pv3">
            Sibyl
          </h1>
          <h2 class="f2 ma0 pt4">
            Run interactive notebooks in the browser
          </h2>
        </section>
        <section class="flex justify-between content-stretch">
          <section class="w-100">
            ${form}
          </section>
          <section>

          </section>
        </section>
      </main>
    </body>
  `

  function onsubmit (e) {
    e.preventDefault()
    var url = e.target.querySelector('#address').value

    var split = url.split('://')
    assert.equal(split.length, 2)

    var protocol = split[0]
    var target = split[1]

    console.log(protocol, target)
  }

  function tryExample () {
    emit(events.SET_EXAMPLE_NOTEBOOK)
  }
}
