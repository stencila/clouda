// Handle pump errors, request should already be terminated by the stream
// so we just log
exports.EPIPE = function (req, res, ctx, err) {
  const url = req.url
  err.message += ' for url ' + url
  ctx.log.error(err)
}

// Handle 404 routes
exports.EURLNOTFOUND = function (req, res, ctx) {
  ctx.log.warn('path not found for', req.url)
  ctx.send(404, { message: 'not found' })
}

exports.ESESSIONINVALID = function (req, res, ctx, err) {
  ctx.log.warn('Invalid session ID')
  ctx.send(403, { message: 'Invalid session ID' })
}

exports.EFORMPARSE = function (req, res, ctx, err) {
  var msg = err.message
  ctx.log.warn(msg)
  ctx.send(403, { message: msg })
}

exports.EBETATOKENINVALID = function (req, res, ctx, err) {
  ctx.log.warn('Invalid token', req.url)
  res.write(`event: stderr\ndata: Invalid beta token\n\n`)
}
