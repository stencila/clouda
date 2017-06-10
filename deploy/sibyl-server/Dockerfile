# Container for running Sibyl's Node.js server

FROM mhart/alpine-node

# Install system packages
RUN apk update \
 && apk upgrade \
 && apk add bash curl docker jq \
 && rm -rf /var/cache/apk/*

# Install kubctrl
RUN curl -L -o /bin/kubectl https://storage.googleapis.com/kubernetes-release/release/v1.6.4/bin/linux/amd64/kubectl \
 && chmod +x /bin/kubectl

RUN mkdir /usr/app 
WORKDIR /usr/app

# Just copy files needed for `npm install` so that it
# is not re-run when an unrelated file (e.g. `sibyl.sh`)
# is changed
COPY package.json .
RUN npm install

# Now copy over everything
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
