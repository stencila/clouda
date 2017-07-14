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

serve:
	npm run serve
