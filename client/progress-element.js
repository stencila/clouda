var CacheComponent = require('cache-component')
var equal = require('shallowequal')
var html = require('choo/html')
var xtend = require('xtend')

module.exports = ProgressElement

function ProgressElement () {
  if (!(this instanceof ProgressElement)) return new ProgressElement()
  this.state = null
  CacheComponent.call(this)
}
ProgressElement.prototype = Object.create(CacheComponent.prototype)

ProgressElement.prototype._render = function (state, emit) {
  var percent = state.sse.percent
  var sse = state.sse

  if (!sse.log.length) return html`<div class="fl"></div>`

  return html`
    <div class="w-100">
      <div class="w-100 mt4">
        <h3 class="f4 b mt3" for="token">
          Progress
        </h3>
        <div class="bg-gray" style="width: ${percent}%; height: 2em"></div>
      </div>
      ${renderLog(state)}
      ${renderButton(state)}
    </div>
  `
}

ProgressElement.prototype._update = function (newState, emit) {
  var prev = this.state
  this.state = xtend(newState)
  if (prev) return equal(prev.sse, newState.sse)
  else return true
}

function renderLog (state) {
  var sse = state.sse
  if (!sse.log.length) return html`<div></div>`

  return html`
    <details class="w-100 gray">
      <summary>Log</summary>
      <div class="f6 pre">
        ${sse.log.map(function (event) {
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

function renderButton (state) {
  var sse = state.sse

  var button = sse.targetUrl
    ? html`
      <a href=${sse.targetUrl}
        class="mh0 pa2 f5 ba bw1 bg-green b--green link white pointer"
        data-no-routing
        target="_blank">
        View
      </a>
    `
    : html`
      <a class="w-20 mh0 pa2 f5 ba bw1 bg-gray b--gray link white">
        ${sse.step}ing
      </a>
    `

  return html`
    <div class="mt4">
      ${button}
    </div>
  `
}
