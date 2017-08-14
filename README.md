## `stencila/cloud` : Stencila in the cloud

[![experimental](https://img.shields.io/badge/stability-experimental-orange.svg)](http://github.com/badges/stability-badges)
[![Build status](https://travis-ci.org/stencila/cloud.svg?branch=master)](https://travis-ci.org/stencila/cloud)
[![Community](https://img.shields.io/badge/join-community-green.svg)](https://community.stenci.la)
[![Chat](https://badges.gitter.im/stencila/stencila.svg)](https://gitter.im/stencila/stencila)

A Stencila `Host` which creates execution `Contexts` and other resources within Docker containers on a Kubernetes cluster. 

**This repo is undergoing a major refactoring to integrate it better with other parts of the Stencila platform. Lots of things are broken but we're working on it!**

### Install

```sh
npm install stencila-cloud
```

### Use

```sh
npm run serve
```

### Develop

Quickstart:

```sh
git clone https://github.com/stencila/cloud.git
cd cloud
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
Run server in production          | `npm run serve`       | `make serve`

### See Also

- [stencila/images](https://github.com/stencila/images)
- [stencila/cli](https://github.com/stencila/cli)
- [stencila/desktop](https://github.com/stencila/desktop)

### License

Apache-2.0
