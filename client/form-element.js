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
  CacheComponent.call(this)
  this.clock = -1
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

  var addressField = html`
    <input name="address" id="address" aria-label="address"
      type="text" required
      autofocus
      placeholder="For example, github://stencila/examples/diamonds"
      title="Must use a valid provider and using a valid formatting, e.g. 'github://stencila/examples/diamonds'"
      class="w-100 w-70-ns mt2 pa2 f5 b--black br2"
      pattern="^[a-zA-Z]+://[a-zA-Z.-_]+$"
      value=${formState.values.address || ''}
    />
  `

  var imageField = html`
    <input name="image" id="image"
      accept="application/x-compressed, application/x-gzip, application/x-tar"
      type="file"
      class=${uploadClass}
    />
  `

  var tokenField = html`
    <input name="token" aria-label="token"
      type="text" required
      class="mt2 pa2 f5 b--black br2"
      value=${formState.values.token || ''}
      placeholder="Token"
    />
  `
  return html`
    <form name="create" id="create"
      class="flex flex-column align-right"
      onsubmit=${onsubmit}
      oninput=${onchange}
      onchange=${onchange}
    >
      <label class="f4 b" for="address">
        Document address
      </label>
      <div class="flex flex-column flex-row-ns">
        ${addressField}
        ${imageField}
        <label for="image"
          class="w-100 w-30-ns ml2-ns mt2 br2 ph2-ns pv2 pointer white bg-black flex justify-center"
        >
          Upload document
        </label>
      </div>
      ${renderProviders(state, emit)}
      <span class="mt1 lh-copy">
        Enter the document address. Is this your first time? See the
        <a class="bn black pointer link underline"
          rel="noopener noreferrer"
          href="http://sibyl.surge.sh/"
          target="_blank"
        >docs</a>
        or
        <button type="button"
          class="bn bg-white pointer pa0 ma0 link underline"
          onclick=${tryExample}
        >
          try an example
        </button>
      </span>
      <label class="f4 b mt3" for="token">
        Beta token
      </label>
      ${tokenField}
      <span class="mt2 lh-copy">
        During the beta, you need to provide a beta token.
      </span>
      <input type="submit" aria-label="open"
        class="mw4 mt3 mh0 bg-black white f5 bn br2 pa2 link pointer"
        value="Open"
      />
    </form>
  `

  function onchange (e) {
    if (e.keyCode === 'Enter') return
    var event = {
      key: e.target.name,
      value: e.target.type === 'file' ? e.target.files[0] : e.target.value,
      type: e.target.type
    }
    emit(state.events.FORM_UPDATE, event)
  }

  function onsubmit (e) {
    e.preventDefault()
    if (e.target.checkValidity() === false) return false
    var data = new window.FormData(e.target)
    emit(state.events.FORM_SUBMIT, data)
  }

  function tryExample (e) {
    e.preventDefault()
    emit(state.events.FORM_SET, {
      key: 'address',
      value: 'github://stencila/examples/diamonds'
    })
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
        if (provider.toLowerCase() === selected) className += ' black b'
        else className += ' light-silver'
        return html`
          <button type="button" class=${className} onclick=${onclick}>
            ${provider}
          </button>
        `
        function onclick (e) {
          e.preventDefault()
          emit(state.events.FORM_SET, {
            key: 'address',
            value: provider.toLowerCase() + '://'
          })
        }
      })}
    </div>
  `
}
