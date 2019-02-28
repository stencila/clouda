# Makefile for stencila/cloud
# 
# Put comment inside recipes so that it is easier
# for users to understand what is being run and what is failing

all: setup lint test build docs

setup:
	# Install Node.js packages
	npm install

hooks:
	# Install pre commit git hooks
	cp pre-commit.sh .git/hooks/pre-commit

lint:
	# Check code for lint code
	npm run lint
	npm run deps-used

test:
	NODE_ENV='development' npm test

cover:
	npm run cover

build:
	# Build the Javascript distribution and stencila/cloud image
	npm run build
	docker build . --tag stencila/cloud

deploy: build
	# Deploy the stencila/cloud image
	docker push stencila/cloud

run-with-minikube:
	NODE_ENV='development' npm start

run-inside-minikube:
	# Build the stencila/cloud image within Minikube
	eval $$(minikube docker-env) && make build
	# Force a redeploy of container(s) by changing REDEPLOY_DATETIME_ env var
	sed "s!REDEPLOY_DATETIME_.*!REDEPLOY_DATETIME_$$(date +%Y-%m-%dT%H:%M:%S%z)!g" minikube.yaml | kubectl apply -f -

docs:
	npm run docs
.PHONY: docs
