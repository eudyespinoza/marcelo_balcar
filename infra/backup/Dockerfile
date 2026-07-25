FROM alpine:3.22
RUN apk add --no-cache bash postgresql17-client restic tzdata
COPY infra/backup/backup.sh /usr/local/bin/backup
RUN chmod +x /usr/local/bin/backup
ENTRYPOINT ["/usr/local/bin/backup"]
