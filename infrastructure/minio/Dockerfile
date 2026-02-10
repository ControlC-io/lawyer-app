# Stage 1: Build the binary from source
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache git
RUN go install github.com/minio/minio@latest

# Stage 2: Final runtime image
FROM alpine:latest
RUN apk add --no-cache ca-certificates
COPY --from=builder /go/bin/minio /usr/bin/minio
VOLUME ["/data"]
EXPOSE 9000 9001
ENTRYPOINT ["minio", "server", "/data", "--console-address", ":9001"]
