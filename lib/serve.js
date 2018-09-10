const Raven = require('raven')

const Host = require('./Host')

if (process.env.SENTRY_DSN) {
  Raven.config(process.env.SENTRY_DSN).install()
}

const host = new Host()
host.run()
