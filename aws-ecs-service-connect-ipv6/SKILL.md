---
name: aws-ecs-service-connect-ipv6
description: Use when ECS Service Connect の DNS alias が IPv6 アドレスを返し、 IPv4-only の Fargate task から `network is unreachable` / `EAI_AGAIN` 等で接続できない問題に遭遇したとき。 OTel Collector → Tempo の OTLP gRPC、 Fargate → Service Connect の HTTP/gRPC 通信が突然失敗する症状が典型。 ECS / Fargate / Service Connect / OTLP / IPv6 dual-stack 関連の接続障害から起動して良い (user が原因を IPv6 と特定していなくても OK)。
---

# ECS Service Connect の IPv6 alias で詰まったとき

## 症状

Fargate task の中から Service Connect alias (`<service>.<namespace>.local:<port>`) に接続しようとして次のエラー:

```
dial tcp [2600:f0f0::3]:<port>: connect: network is unreachable
```

`2600:f0f0::3` は AWS Service Connect Envoy proxy が listen する IPv6 アドレス。

## 原因

ECS Service Connect は service alias に **IPv4 + IPv6** の両方を登録する (Envoy proxy が dual-stack listen)。一方 Fargate awsvpc task は **IPv4 only** がデフォルト。grpc-go や他の dual-stack client が DNS の最初に返ってきた IPv6 を選ぶと、IPv6 outbound 経路が無いので unreachable。

## 回避策（楽な順）

### A. プロトコルを HTTP に切り替える

OTLP gRPC (4317) の代わりに **OTLP HTTP** (4318) を使う。HTTP client (Go の `net/http` 等) は IPv4 を試行することが多く、dual-stack dial の問題を踏みにくい。

OpenTelemetry Collector の例:

```yaml
exporters:
  # 旧: otlp (gRPC) で IPv6 で詰まる
  # otlp/tempo:
  #   endpoint: tempo.study-aws.local:4317
  # 新: otlphttp で OK
  otlphttp/tempo:
    endpoint: http://tempo.study-aws.local:4318
    tls:
      insecure: true

service:
  pipelines:
    traces:
      exporters: [otlphttp/tempo]
```

target 側の Service Connect 設定は HTTP port (4318) も alias にしておく:

```hcl
service_connect_configuration {
  service {
    port_name      = "otlp-grpc"
    discovery_name = "tempo"
    client_alias { port = 4317; dns_name = "tempo.study-aws.local" }
  }
  service {
    port_name      = "otlp-http"
    discovery_name = "tempo-http"
    client_alias { port = 4318; dns_name = "tempo.study-aws.local" }
  }
}
```

### B. Cloud Map private DNS namespace + A record (IPv4 only)

Service Connect (`aws_service_discovery_http_namespace`) ではなく **Service Discovery** (`aws_service_discovery_private_dns_namespace`) + `aws_service_discovery_service` で A record を直接登録。Envoy proxy が挟まらず Cloud Map の A record (IPv4) が直接返る。`AWS::ServiceDiscovery::Service` の `DnsConfig.DnsRecords` を `A` のみにする。

ECS Service の `service_registries` 経由で attach する。Service Connect の機能 (Envoy mesh) は使えなくなるが、IPv6 issue は出ない。

### C. クライアント側で IPv4 を強制

Go なら `GODEBUG=netdns=go+1` で `gai.conf` 設定を有効化、`/etc/gai.conf` に `precedence ::ffff:0:0/96 100` で IPv4 priority。container env で渡せる。

ただし build-once な image だと毎度の再 build 必要、Service Connect 設定変更より重い。

## 診断

ECS Task の中から DNS resolve を確認:

```sh
aws ecs execute-command --cluster <c> --task <t> --container <name> --interactive --command "/bin/sh -c 'getent hosts tempo.study-aws.local'"
```

IPv6 が返るなら本症状確定。

## 関連

- gRPC は HTTP/2 ベースだが、`grpc-go` の resolver は IP family の優先順を制御しにくい
- `appProtocol = "grpc"` を Service Connect の portMappings に書くと Envoy が gRPC として handle するが、IPv6 issue は別問題
