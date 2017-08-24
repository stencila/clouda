all: setup lint build


setup:
	npm install

lint:
	npm run lint

build:
	docker build . --tag stencila/cloud


# Run locally in development mode
run:
	NODE_ENV='development' npm start

# Run locally in production mode
run-prod:
	npm start

# Run within a stencila/cloud container
# - `-it` option so that can use Ctrl+C to stop
# - `--rm` to do clean up
# - `--net` to share the network with host so containers are accessible
# - `--volume` to use the local Docker engine to create session 'pods'
run-docker:
	docker run -it --rm --net='host' \
			   --volume /var/run/docker.sock:/var/run/docker.sock \
	           --env NODE_ENV='development' \
	           stencila/cloud


# Run in Minikube
# - build the stencila/cloud image within Minikube
# - force a redeploy of container(s) by changing REDEPLOY_DATETIME_ env var
run-minikube:
	eval $$(minikube docker-env) && docker build . --tag stencila/cloud
	sed -r "s!REDEPLOY_DATETIME_.*!REDEPLOY_DATETIME_$$(date --iso=seconds)!g" minikube.yaml | kubectl apply -f -
