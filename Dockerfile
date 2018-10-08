# The stencila/cloud Docker container image

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

# Install docker to have a docker client for building (for custom images based off repos)
# and running (when dev testing this image) Docker images
# For latest release see https://download.docker.com/linux/debian/dists/jessie/pool/stable/amd64/
RUN curl -o docker.deb https://download.docker.com/linux/debian/dists/jessie/pool/stable/amd64/docker-ce_18.03.1~ce-0~debian_amd64.deb \
 && dpkg -i docker.deb \
 && rm docker.deb

# Install kubctrl for accessing the Kubernetes API
# See https://kubernetes.io/docs/tasks/access-application-cluster/access-cluster/#accessing-the-api-from-a-pod
# For latest release see https://github.com/kubernetes/kubernetes/releases
RUN curl -L -o /bin/kubectl https://storage.googleapis.com/kubernetes-release/release/v1.10.5/bin/linux/amd64/kubectl \
 && chmod +x /bin/kubectl

# Run as non-root user
RUN useradd -m cloud
WORKDIR /home/cloud
USER cloud

# Just copy `package.json` for `npm install` so that it
# is not re-run when an unrelated file is changed
COPY package.json .
RUN npm install --production

# Now copy over everything
COPY . .

# Expose HostHttpServer.js port
EXPOSE 2000

CMD ["bash", "cmd.sh"]
