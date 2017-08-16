# Container for running Sibyl's Node.js server

FROM node:8

ENV DEBIAN_FRONTEND noninteractive
ENV NPM_CONFIG_LOGLEVEL warn

# Install system packages. 
# `init-system-helpers` etc are needed for docker
RUN apt-get update \
 && apt-get install -y \
 		init-system-helpers iptables libapparmor1 \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/

# Install docker to have a docker client for building Docker images
RUN curl -o docker.deb https://download.docker.com/linux/debian/dists/jessie/pool/stable/amd64/docker-ce_17.03.0~ce-0~debian-jessie_amd64.deb \
 && dpkg -i docker.deb \
 && rm docker.deb

# Install kubctrl for accessing the Kubernetes API
# See https://kubernetes.io/docs/tasks/access-application-cluster/access-cluster/#accessing-the-api-from-a-pod
RUN curl -L -o /bin/kubectl https://storage.googleapis.com/kubernetes-release/release/v1.6.4/bin/linux/amd64/kubectl \
 && chmod +x /bin/kubectl

# Install gcloud for pushing images to the Google container registry
RUN curl -sSL https://sdk.cloud.google.com | bash
ENV PATH $PATH:/root/google-cloud-sdk/bin

RUN mkdir /usr/app 
WORKDIR /usr/app

# Just copy `package.json` for `npm install` so that it
# is not re-run when an unrelated file is changed
COPY package.json .
RUN npm install

# Now copy over everything
COPY . .

# Expose HostHttpServer.js port
EXPOSE 2000

CMD ["bash", "cmd.sh"]
