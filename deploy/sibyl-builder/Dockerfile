# Container image for building Sibyl's base images

FROM ubuntu:16.04

RUN apt-get update \
 && apt-get install -y docker.io curl \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/

COPY run.sh /usr/app/run.sh
RUN chmod +x /usr/app/run.sh

RUN apt-get update \
 && apt-get install -y cron \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/


ADD crontab /etc/cron.d/sibyl-builder
RUN chmod 0644 /etc/cron.d/sibyl-builder

RUN touch /var/log/cron.log
 
CMD cron -f -L15 
