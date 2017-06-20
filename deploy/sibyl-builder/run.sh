#!/usr/bin/env sh

rm -rf stencila-sibyl*

curl --location "https://github.com/stencila/sibyl/tarball/master" > stencila-sibyl.tar.gz
tar -xzf stencila-sibyl.tar.gz

cd stencila-sibyl*

tag=$(date -u -I)
for name in alpha iota ; do
	docker build images/$name --tag "stencila/$name:latest" --tag "stencila/$name:$tag"
	docker push "stencila/$name:$tag"
done
