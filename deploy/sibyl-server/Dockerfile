# Container for running Sibyl's Node.js server

FROM node:6

ENV DEBIAN_FRONTEND noninteractive
ENV NPM_CONFIG_LOGLEVEL warn

# Install system packages. 
# `init-system-helpers` etc are needed for docker
RUN apt-get update \
 && apt-get install -y \
 		net-tools jq  \
 		init-system-helpers iptables libapparmor1 \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/

# Install docker
RUN curl -o docker.deb https://download.docker.com/linux/debian/dists/jessie/pool/stable/amd64/docker-ce_17.03.0~ce-0~debian-jessie_amd64.deb \
 && dpkg -i docker.deb \
 && rm docker.deb

# Install kubctrl
RUN curl -L -o /bin/kubectl https://storage.googleapis.com/kubernetes-release/release/v1.6.4/bin/linux/amd64/kubectl \
 && chmod +x /bin/kubectl

# Install gcloud
RUN curl -sSL https://sdk.cloud.google.com | bash
ENV PATH $PATH:/root/google-cloud-sdk/bin

# Install dat
RUN npm install dat --global

RUN mkdir /usr/app 
WORKDIR /usr/app

# Just copy files needed for `npm install` so that it
# is not re-run when an unrelated file (e.g. `sibyl.sh`) is changed
COPY package.json .
RUN npm install

# Now copy over everything and do build
COPY . .
RUN npm run build

# Expose server.js port
EXPOSE 3000

CMD ["bash", "cmd.sh"]
