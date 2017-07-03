var CacheComponent = require('cache-component')
var html = require('choo/html')

module.exports = FormElement

function FormElement () {
  if (!(this instanceof FormElement)) return new FormElement()
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
      <input name="address" type="text" aria-label="address"
        class="mt2 pa2 f5 b--black br2"
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
        class="mt2 pa2 f5 b--black br2"
        value=${formState.values.token}
        onchange=${onchange}
        onkeyup=${onchange}
        placeholder="Token">
      <span class="mt2 lh-copy">
        During the beta, you need to provide a beta token.
      </span>
      <input type="submit" aria-label="open"
        class="mw4 mt3 mh0 bg-white f5 b--black br2 pa2 link pointer"
        value="Open">
    </form>
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
