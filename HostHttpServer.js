const body = require('body')
const cookie = require('cookie')
const merry = require('merry')
const url = require('url')

class HostHttpServer {
  constructor (host, address = '127.0.0.1', port = 2000) {
    this._host = host
    this._address = address
    this._port = port
  }

  /**
   * Start this server
   */
  start () {
    const app = merry()

    const error = function (req, res, ctx, code, message) {
      ctx.log.error('Error', message, req.url)
      ctx.send(code, { message: message })
    }

    const parse = (req, res, ctx, regex, cb) => {
      const match = url.parse(req.url).pathname.match(regex)
      if (!match) return error(req, res, ctx, 400, 'Bad Request')
      const token = cookie.parse(req.headers.cookie || '').token
      body(req, (err, body) => {
        if (err) return error(req, res, ctx, 500, err.message)
        const data = body ? JSON.parse(body) : null
        cb(match, token, data)
      })
    }

    const send = (req, res, ctx, body, token) => {
      let origin = 'http://' + url.parse(req.headers.referer || '').host
      let headers = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true'
      }
      if (token) headers['Set-Cookie'] = `token=${token}`
      ctx.send(200, body || ' ', headers)
    }

    app.route('OPTIONS', '/*', (req, res, ctx) => {
      // CORS headers added to all requests to allow direct access by browsers
      // See https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Max-Age', '1728000')
      send(req, res, ctx)
    })

    app.route('GET', '/', (req, res, ctx) => {
      parse(req, res, ctx, /\//, (match, token, data) => {
        this._host.manifest(token, (err, manifest, token) => {
          if (err) return error(req, res, ctx, 500, err.message)
          send(req, res, ctx, manifest, token)
        })
      })
    })

    app.route('POST', '/*', (req, res, ctx) => {
      parse(req, res, ctx, /\/(.+)/, (match, token, data) => {
        const type = match[1]
        const options = data
        const name = options && options.name
        this._host.post(type, options, name, token, (err, address, token) => {
          if (err) return error(req, res, ctx, 500, err.message)
          send(req, res, ctx, address, token)
        })
      })
    })

    app.route('PUT', '/*', (req, res, ctx) => {
      parse(req, res, ctx, /\/([^!]+)!(.+)/, (match, token, data) => {
        const address = match[1]
        const method = match[2]
        const args = data
        this._host.put(address, method, args, token, (err, result, token) => {
          if (err) return error(req, res, ctx, 500, err.message)
          send(req, res, ctx, result, token)
        })
      })
    })

    app.route('default', (req, res, ctx) => {
      ctx.log.warn('path not found for', req.url)
      ctx.send(404, { message: 'not found' })
    })

    app.listen(this._port)
  }
}

module.exports = HostHttpServer
