all: setup test build


setup:
	npm install

watch:
	npm run watch

run:
	npm start

test:
	npm test

build:
	npm run build

image:
	docker build . --tag stencila/cloud

serve:
	npm run serve
