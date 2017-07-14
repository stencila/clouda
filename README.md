# open

[![experimental](https://img.shields.io/badge/stability-experimental-orange.svg)](http://github.com/badges/stability-badges)
[![Build status](https://travis-ci.org/stencila/open.svg?branch=master)](https://travis-ci.org/stencila/open)
[![Community](https://img.shields.io/badge/join-community-green.svg)](https://community.stenci.la)
[![Chat](https://badges.gitter.im/stencila/stencila.svg)](https://gitter.im/stencila/stencila)

Open reproducible, containerized documents in the browser.

## Develop

Quickstart:

```sh
git clone https://github.com/stencila/open.git
cd open
npm install
npm run watch
npm start
```

Most development tasks can be run directly from `npm` or via `make` recipes (we use Makefiles to provide similar, convenient development commands across Stencila repos using different languages with different tooling).

Task                                                    | `npm`                 | `make`          |
------------------------------------------------------- |-----------------------|-----------------|    
Install dependencies                                    | `npm install`         | `make setup`
Run tests                                               | `npm test`            | `make test`
Build client during development                         | `npm run watch`       | `make watch`
Run server during development                           | `npm start`           | `make run`
Build client for production                             | `npm run build`       | `make build`
Run server in production                                | `npm serve`           | `make serve`


## See Also
- [stencila/sibyl](https://github.com/stencila/sibyl)

## License
Apache-2.0
