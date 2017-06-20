# Container for running Sibyl's Node.js server

FROM node:alpine

# Install system packages
RUN apk add --no-cache bash curl docker jq

# Install dat
# A `global` install fails (permissions error) so we install in `/bin` and
# create a symlink
RUN cd /bin \
 && apk add --no-cache --virtual build-dependencies python g++ make \
 && npm install dat \
 && apk del build-dependencies \
 && ln -s /bin/node_modules/.bin/dat dat

# Install kubctrl
RUN curl -L -o /bin/kubectl https://storage.googleapis.com/kubernetes-release/release/v1.6.4/bin/linux/amd64/kubectl \
 && chmod +x /bin/kubectl

RUN mkdir /usr/app 
WORKDIR /usr/app

# Just copy files needed for `npm install` so that it
# is not re-run when an unrelated file (e.g. `sibyl.sh`)
# is changed
COPY package.json .
RUN npm install && npm run build

# Now copy over everything
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
