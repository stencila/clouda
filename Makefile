all: setup lint build


setup:
	npm install

lint:
	npm run lint

run:
	NODE_ENV='development' npm start

run-prod:
	NODE_ENV='production' npm start

build:
	docker build . --tag stencila/cloud

minikube:
	# Build the Docker image within Minikube
	eval $$(minikube docker-env) && docker build . --tag stencila/cloud
	# Force a redeploy of container(s) by changing env vars
	sed -r "s!REDEPLOY_DATETIME_.*!REDEPLOY_DATETIME_$$(date --iso=seconds)!g" minikube.yaml | kubectl apply -f -
