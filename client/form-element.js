var CacheComponent = require('cache-component')
var html = require('choo/html')
var css = require('sheetify')

var uploadClass = css`
  :host {
    width: 0.1px;
    height: 0.1px;
    opacity: 0;
    overflow: hidden;
    position: absolute;
    z-index: -1;
  }
`

var providerNames = [
  'Bitbucket',
  'Dat',
  'Docker',
  'Dropbox',
  'File',
  'GitHub',
  'GitLab'
]

module.exports = FormElement

function FormElement () {
  if (!(this instanceof FormElement)) return new FormElement()
  this.clock = -1
  CacheComponent.call(this)
}
FormElement.prototype = Object.create(CacheComponent.prototype)

FormElement.prototype._update = function (state, emit) {
  var newClock = state.form.clock
  var oldClock = this.clock
  this.clock = newClock
  return newClock > oldClock
}

FormElement.prototype._render = function (state, emit) {
  var formState = state.form
  return html`
    <form class="flex flex-column align-right" onsubmit=${onsubmit}>
      <label class="f4 b" for="address">
        Document address
      </label>
      <div class="flex flex-column flex-row-ns">
        <input name="address" id="address" type="text" aria-label="address"
          class="w-100 w-70-ns mt2 pa2 f5 b--black br2"
          value=${formState.values.address}
          onchange=${onchange}
          onkeyup=${onchange}
          placeholder="For example, github://stencila/examples/diamonds" />
        <input name="image" id="image" type="file"
          onchange=${onchange}
          class=${uploadClass}/>
        <label for="image"
          class="w-100 w-30-ns ml2-ns mt2 br2 ph2-ns pv2 pointer white bg-black flex justify-center">
          Upload document
        </label>
      </div>
      ${renderProviders(state, emit)}
      <span class="mt1 lh-copy">
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
        class="mt2 pa2 f5 b--black br2"
        value=${formState.values.token}
        onchange=${onchange}
        onkeyup=${onchange}
        placeholder="Token">
      <span class="mt2 lh-copy">
        During the beta, you need to provide a beta token.
      </span>
      ${formState.valid
        ? html`<input type="submit" aria-label="open"
            class="mw4 mt3 mh0 bg-black white f5 bn br2 pa2 link pointer"
            value="Open">`
        : html`<input type="submit" aria-label="open"
            disabled
            class="mw4 mt3 mh0 bg-silver white f5 bn br2 pa2 link"
            value="Open">`
      }
    </form>
  `

  function onchange (e) {
    if (e.key === 'Enter') return onsubmit()
    var event = {
      key: e.target.name,
      value: e.target.type === 'file' ? e.target.files[0] : e.target.value
    }
    emit(state.events.FORM_UPDATE, event)
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

function renderProviders (state, emit) {
  var selected = state.form.selected
  return html`
    <div class="flex flex-row mt1 lh-copy">
      <b class="f6 black">
        Provider:
      </b>
      ${providerNames.map(function (provider, i) {
        var className = 'f6 ml2 bn pa0 bg-white pointer link'
        // if (i !== 0) className += ' ml2'
        if (provider.toLowerCase() === selected) className += ' black b'
        else className += ' light-silver'
        return html`
          <button class=${className} onclick=${onclick}>
            ${provider}
          </button>
        `
        function onclick (e) {
          e.preventDefault()
          emit(state.events.FORM_UPDATE, {
            key: 'address',
            value: provider.toLowerCase() + '://'
          })
        }
      })}
    </div>
  `
}
