# Makefile for stencila/cloud
# 
# Put comment inside recipes so that it is easier
# for users to understand what is being run and what is failing

all: setup lint build

setup:
	# Install Node.js packages
	npm install

lint:
	# Check code for lint code
	npm run lint

build:
	# Build the stencila/cloud image
	docker build . --tag stencila/cloud

deploy: build
	# Deploy the stencila/cloud image
	docker push stencila/cloud

run:
	# Run locally in development mode
	NODE_ENV='development' npm start

run-prod:
	# Run locally in production mode
	npm start

run-docker:
	# Run within a stencila/cloud container
	#  `-it` option so that can use Ctrl+C to stop
	#  `--rm` to do clean up
	#  `--net` to share the network with host so containers are accessible
	#  `--volume` to use the local Docker engine to create session 'pods'
	docker run -it --rm --net='host' \
			   --volume /var/run/docker.sock:/var/run/docker.sock \
	           --env NODE_ENV='development' \
	           stencila/cloud

run-minikube:
	# Build the stencila/cloud image within Minikube
	eval $$(minikube docker-env) && docker build . --tag stencila/cloud
	# Force a redeploy of container(s) by changing REDEPLOY_DATETIME_ env var
	sed -r "s!REDEPLOY_DATETIME_.*!REDEPLOY_DATETIME_$$(date --iso=seconds)!g" minikube.yaml | kubectl apply -f -
