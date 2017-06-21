# Container image for building Sibyl's base images

FROM alpine

RUN apk add --no-cache curl docker

RUN mkdir -p /usr/app
WORKDIR /usr/app

COPY run.sh .
RUN chmod +x run.sh

RUN echo "0 12 * * *     /usr/app/run.sh" > /etc/crontabs/root

CMD ["crond", "-f", "-d", "0"]
