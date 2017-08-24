#!/usr/bin/env bash

# Run kubectl proxy for within cluster access to the Kubernetes API
# See https://kubernetes.io/docs/tasks/access-application-cluster/access-cluster/#accessing-the-api-from-a-pod
kubectl proxy --port=8000 &

# Start the HostHttpServer
npm start
