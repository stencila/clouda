#!/usr/bin/env bash

# Run kubectl proxy for within cluster access to the API
# See https://kubernetes.io/docs/tasks/access-application-cluster/access-cluster/#accessing-the-api-from-a-pod
kubectl proxy --port=8000 &

# Authenticate with gcloud for pushing Docker images built within the cluster
if test -e "/mnt/secrets/gcloud-key-file.json"
then
	echo "Authenticating with gcloud"
	gcloud auth activate-service-account --key-file /mnt/secrets/gcloud-key-file.json
fi

# Serve host
npm start
