## `stencila/cloud` : Stencila in the cloud

[![experimental](https://img.shields.io/badge/stability-experimental-orange.svg)](http://github.com/badges/stability-badges)
[![Build status](https://travis-ci.org/stencila/cloud.svg?branch=master)](https://travis-ci.org/stencila/cloud)
[![Community](https://img.shields.io/badge/join-community-green.svg)](https://community.stenci.la)
[![Chat](https://badges.gitter.im/stencila/stencila.svg)](https://gitter.im/stencila/stencila)

## Purpose

A Stencila `Host` which creates execution `Contexts` and other resources within Docker containers on a Kubernetes cluster. 

## Install

See [`minikube.yaml`](minikube.yaml) for an example deployment.

## Develop

Quickstart:

```sh
git clone https://github.com/stencila/cloud.git
cd cloud
npm install
npm start
```

Most development tasks can be run directly from `npm` or via `make` recipes (we
use Makefiles to provide similar, convenient development commands across
Stencila repos using different languages with different tooling).

Task                       | `npm`                                | `make`          |
---------------------------|--------------------------------------|-----------------|
Install dependencies       | `npm install`                        | `make setup`
Check for lint             | `npm run lint`                       | `make lint`
Run during development     | `NODE_ENV='development' npm start`   | `make run`
Run in production          | `npm start`                          | `make run-prod`


### Local development

You can try out this stencila/stencila:

```bash
STENCILA_PEERS="http://127.0.0.1:2000" npm start
```

### Docker testing

```bash
make run-docker
```

### Minikube testing

Install [`minikube`](https://kubernetes.io/docs/tasks/tools/install-minikube/) and [`kubectrl`](https://kubernetes.io/docs/tasks/tools/install-kubectl/). Then start the Minikube cluster

```bash
minikube start
```

Deploy to the cluster,

```bash
make deploy-minikube
```

Check the `Deployment` is ready (the dashboard can be useful for this too: `minikube dashboard`),

```sh
kubectl get deployments

NAME               DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
sibyl              1         1         1            1           1h
```

You can then get the URL of the host:,

```sh
minikube service stencila-cloud-server --url
```

And check that it responds:

```sh
curl $(minikube service stencila-cloud-server --url)
```

Then in your stencila/stencila directory, 

```bash
STENCILA_PEERS=$(minikube service stencila-cloud-server --url) npm start
```

If you're developing the Docker images in the [`stencila/images`](http://github.com/stencila/images) repo you can save time (and bandwidth) by not pushing/pulling images to/from the Docker Hub registry and the Minikube cluster. To do that, configure your local Docker client to use the Docker engine running inside the Minikube cluster:

```bash
eval $(minikube docker-env)
```
