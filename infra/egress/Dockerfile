# The egress proxy (M2.1 plan §5b): Smokescreen at the commit go.mod pins, with Arablyzer's
# wrapper (main.go) and the deny list generated from the egress package (smokescreen.yaml).
#
#   docker build -t arablyzer-egress infra/egress
FROM golang:1.26-alpine@sha256:8ac98ca534ac3f51e1f420a1dd2c15e74c75cfa0f23f3ad27eb5d7236c349a0c AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /egress .

FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
COPY --from=build /egress /egress
COPY smokescreen.yaml /etc/egress/smokescreen.yaml
EXPOSE 4750
ENTRYPOINT ["/egress", "--config-file", "/etc/egress/smokescreen.yaml"]
