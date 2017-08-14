#!/usr/bin/env bash

# Authenticate with gcloud
if test -e "/mnt/secrets/gcloud-key-file.json"
then
	echo "Authenticating with gcloud"
	gcloud auth activate-service-account --key-file /mnt/secrets/gcloud-key-file.json
fi

# Serve server.js
npm run serve
