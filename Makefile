# Makefile for stencila/cloud
# 
# Put comment inside recipes so that it is easier
# for users to understand what is being run and what is failing

CLOUD_VERSION := $(shell ./version-get.sh)
DOCKER_IMAGE_NAME := stencila/cloud

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
	docker build . --tag $(DOCKER_IMAGE_NAME)

deploy: build
	# Deploy the stencila/cloud image
	docker push $(DOCKER_IMAGE_NAME)

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


# Deployment/Versioning Things

release: setup build docker-release

# Exit with status 1 if git has uncommitted changes.
git-dirty-check:
	git diff-index --quiet --cached HEAD -- && git diff-files --quiet --ignore-submodules --

# Build Docker image with current version tag
docker-versioned-build: git-dirty-check Dockerfile
	docker build . --tag $(DOCKER_IMAGE_NAME):$(CLOUD_VERSION)

# Push versioned Docker image to Docker hub
docker-release: docker-versioned-build
	docker push $(DOCKER_IMAGE_NAME):$(CLOUD_VERSION)

# Increment the Major Version of Cloud
increment-major:
	./version-increment.sh major

# Increment the Minor Version of Cloud
increment-minor:
	./version-increment.sh minor

# Increment the Patch Version of Cloud
increment-patch:
	./version-increment.sh patch

# Make annotated tag based on the cloud version
tag: git-dirty-check
	git tag -a v$(CLOUD_VERSION) -m "Cloud version $(CLOUD_VERSION)"
