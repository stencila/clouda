# `stencila/server` : Stencila in the cloud

[![experimental](https://img.shields.io/badge/stability-experimental-orange.svg)](http://github.com/badges/stability-badges)
[![Build status](https://travis-ci.org/stencila/server.svg?branch=master)](https://travis-ci.org/stencila/server)
[![Community](https://img.shields.io/badge/join-community-green.svg)](https://community.stenci.la)
[![Chat](https://badges.gitter.im/stencila/stencila.svg)](https://gitter.im/stencila/stencila)

Launch Stencila documents.

## Develop
Quickstart:

```sh
git clone https://github.com/stencila/server.git
cd server
npm install
npm run watch
npm start
```

Most development tasks can be run directly from `npm` or via `make` recipes (we
use Makefiles to provide similar, convenient development commands across
Stencila repos using different languages with different tooling).

Task                              | `npm`                 | `make`          |
----------------------------------|-----------------------|-----------------|
Install dependencies              | `npm install`         | `make setup`
Run tests                         | `npm test`            | `make test`
Build client during development   | `npm run watch`       | `make watch`
Run server during development     | `npm start`           | `make run`
Build client for production       | `npm run build`       | `make build`
Run server in production          | `npm serve`           | `make serve`

## See Also

- [stencila/cli](https://github.com/stencila/cli)
- [stencila/desktop](https://github.com/stencila/desktop)

## License

Apache-2.0
