const html = require('choo/html')
const css = require('sheetify')

css('tachyons')

css`
  .content {
    margin: 0 auto;
    max-width: 50em;
  }

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
  return html`
  <body>
    <div class="content">
    <p>Enter an address e.g. github://octocat/spoon-knife:</p>
    <form onsubmit=${onsubmit}>
      <input id='address'>
    </form>
    <p>Or have a look at these:</p>
    <ul>
      <li>
        <a href="/github://octocat/spoon-knife" data-no-routing>
          github://octocat/spoon-knife
        </a>
      </li>
    </ul>
    </div>
  </body>
  `

  function onsubmit () {
    window.location = '/' + document.getElementById('address').value
    return false
  }
}
