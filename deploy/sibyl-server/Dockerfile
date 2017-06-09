# Container for running Sibyl's Node.js server

FROM mhart/alpine-node

RUN apk update \
 && apk upgrade \
 && apk add bash curl docker jq \
 && rm -rf /var/cache/apk/*

RUN mkdir /usr/app 
WORKDIR /usr/app

# Just copy files needed for `npm install` so that it
# is not re-run when an unrelated file (e.g. `client/index.html`)
# is changed
COPY sibyl.sh .
COPY package.json .
RUN npm install

# Now copy over everything
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
