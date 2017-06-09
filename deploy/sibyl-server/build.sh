#!/usr/bin/env bash

cp ../../sibyl.sh .
cp ../../package.json .
cp -R ../../client/ .
cp -R ../../server/ .
docker build . --tag stencila/sibyl-server
