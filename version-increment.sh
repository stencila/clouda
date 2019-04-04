#!/bin/bash
set -e

CLOUD_VERSION=`./version-get.sh`
VERSION_COMPONENT=$1

if [[ ${VERSION_COMPONENT} == "major" ]] || [[ ${VERSION_COMPONENT} == "minor" ]] || [[ ${VERSION_COMPONENT} == "patch" ]]
then
    npm version --no-git-tag-version ${VERSION_COMPONENT}
    NEW_CLOUD_VERSION=`./version-get.sh`
    git commit -am "Bumped version from ${CLOUD_VERSION} to ${NEW_CLOUD_VERSION}"
else
    echo "Unknown version component to increment: ${VERSION_COMPONENT}. Expected 'major', 'minor' or 'patch'."
    false
fi
