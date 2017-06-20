# Container image for building Sibyl's base images

FROM alpine

RUN apk add --no-cache curl docker

RUN mkdir -p /usr/app
WORKDIR /usr/app

COPY run.sh .
RUN chmod +x run.sh

RUN echo '0 12 * * * sh run.sh' > crontab.tmp \
    && crontab crontab.tmp \
    && rm -rf crontab.tmp

CMD ["crond", "-f", "-d", "0"]
