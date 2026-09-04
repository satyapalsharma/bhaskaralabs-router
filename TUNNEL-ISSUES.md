# Tunnel / Real-Traffic Issues Log
Auto-monitored every ~12 min while project generation runs.
Issues noted here get fixed before the next run.

Format: `[timestamp] severity — issue — evidence — proposed fix`

## check 2026-09-03 18:45 — turns=10 failovers=4 cache_hit=67% max_billed=10913
- [2026-09-03 18:45] failover (gw) — — backing off 30000ms, retrying same Idempotency-Key {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 18:45] failover (gw) — "0/0","raw":6899,"cached":0,"ms":163060,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 18:45] stream/dispatch-error (gw) — :"8251/60","raw":6745,"cached":7896,"ms":10329,"ttft":null} [dispatch feihoa] attempt 1 failed (The socket connection was closed unexpectedly. For more info), retrying [feihoa] 429

### Analysis (manual, 18:47)
1. **feihoa 429 → yolo failover (4x/10 turns)**: EXPECTED — feihoa concurrency=1, overlapping requests hop to yolo. Failover is working (all served). Not a bug; shows lane design paying off. If failover rate stays >30%, consider routing large-context turns to yolo FIRST (feihoa only for small ctx) to reduce wasted 429s.
2. **feihoa socket closed unexpectedly (dispatch attempt 1)**: REAL ISSUE — feihoa drops TCP mid-request sometimes. Gateway pre-stream retry (attempt 2) is catching it and succeeding, so no user impact yet. PROPOSED FIX (next run): add a 2nd retry with backoff for socket-close specifically, and log socket-close count as a metric. If frequent, treat feihoa as flaky and bias routing toward yolo.

## check 2026-09-03 19:23 — turns=4 failovers=0 cache_hit=70% max_billed=60
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.192.77 2026-09-03T13:36:49Z ERR failed to serve tunnel connection error="datagram manager encountered a failure while serving" connIndex=0 event=0 i
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.192.77 2026-09-03T13:36:49Z ERR Serve tunnel error error="datagram manager encountered a failure while serving" connIndex=0 event=0 ip=198.41.192.77
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:36:57Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:36:57Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:37:01Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:37:01Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:37:08Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:37:08Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:37:34Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:37:34Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:49:42Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:49:42Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:49:56Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:49:56Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:50:01Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:50:01Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:50:14Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:50:14Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:50:43Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:50:43Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:50:45Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:50:45Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:51:15Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:51:15Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:51:43Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:51:43Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:52:13Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:52:13Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:52:21Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:52:21Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:52:43Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:52:43Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:52:46Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:52:46Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:52:51Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:52:51Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:53:08Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:53:08Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:53:12Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:53:12Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:53:23Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:53:23Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:53:42Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:53:42Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:53:48Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:23] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:53:48Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2

## check 2026-09-03 19:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:54:14Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:54:14Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:54:17Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:54:17Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:54:49Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:54:49Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:55:13Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:55:13Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:55:27Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:55:27Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:55:42Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:55:42Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:56:11Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:56:11Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:56:25Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:56:25Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:56:48Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:56:48Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:56:55Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:56:55Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:57:00Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:57:00Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:57:27Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:57:27Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:57:56Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:57:56Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:58:19Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:58:19Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:58:29Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:58:29Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:58:54Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:58:54Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:59:07Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:59:07Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:59:09Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:59:09Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:59:16Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:59:16Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:59:44Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T13:59:44Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:00:00Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:00:00Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:00:13Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:00:13Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:00:44Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:00:44Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:01:12Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:01:12Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:01:13Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:01:13Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:01:14Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:01:14Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:01:37Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:01:37Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:02:03Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:02:03Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:02:19Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:02:19Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:02:46Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:02:46Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:02:51Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:02:51Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:03:02Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:03:02Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:03:04Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:03:04Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:03:30Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:03:30Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:03:50Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:03:50Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:04:19Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:04:19Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:04:48Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:04:48Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:05:19Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:05:19Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:05:43Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:35] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:05:43Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2

## check 2026-09-03 19:48 — turns=0 failovers=0 cache_hit=0% max_billed=0
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:06:08Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:06:08Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:06:10Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:06:10Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:06:20Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:06:20Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:06:38Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:06:38Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:06:45Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:06:45Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:07:16Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:07:16Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:07:27Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:07:27Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:07:33Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:07:33Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:08:05Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:08:05Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:08:26Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:08:26Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:08:46Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:08:46Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:08:50Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:08:50Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:09:17Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:09:17Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:09:42Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:09:42Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:10:14Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:10:14Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:10:18Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:10:18Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:11:34Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:11:34Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:11:46Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:11:46Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:12:10Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:12:10Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:12:14Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:12:14Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:12:40Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:12:40Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:13:01Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:13:01Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:13:08Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:13:08Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:13:28Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:13:28Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:13:45Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:13:45Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:14:00Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:14:00Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:14:13Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:14:13Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:14:17Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:14:17Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:14:37Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:14:37Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:14:40Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:14:40Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:08Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:08Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:30Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:30Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:34Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:34Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:46Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:46Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:55Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:55Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:58Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:15:58Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:16:07Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:16:07Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:16:35Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:16:35Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:16:36Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:16:36Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:00Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:00Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:02Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:02Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:07Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:07Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:19Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:19Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:22Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:22Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:50Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:50Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:51Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:17:51Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:18:20Z ERR failed to serve tunnel connection error="control stream encountered a failure while serving" connIndex=0 event=0 ip=
- [2026-09-03 19:48] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.200.43 2026-09-03T14:18:20Z ERR Serve tunnel error error="control stream encountered a failure while serving" connIndex=0 event=0 ip=198.41.200.43 2

## check 2026-09-03 20:00 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-03 20:12 — turns=10 failovers=0 cache_hit=55% max_billed=67
- [2026-09-03 20:12] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.192.37 2026-09-03T14:33:46Z ERR failed to serve tunnel connection error="accept stream listener encountered a failure while serving" connIndex=0 eve
- [2026-09-03 20:12] tunnel-edge-down (cf) — " connIndex=0 event=0 ip=198.41.192.37 2026-09-03T14:33:46Z ERR Serve tunnel error error="accept stream listener encountered a failure while serving" connIndex=0 event=0 ip=198.41.

## check 2026-09-03 20:24 — turns=38 failovers=13 cache_hit=58% max_billed=13482
- [2026-09-03 20:24] failover (gw) — ":"0/0","raw":3743,"cached":0,"ms":6574,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 20:24] failover (gw) — ent generation is still running. Please wait for i"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 20:24] failover (gw) — — backing off 14000ms, retrying same Idempotency-Key {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 20:24] failover (gw) — nding requests faster than this plan allows. Reduc"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 20:24] failover (gw) — — backing off 13000ms, retrying same Idempotency-Key {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 20:24] failover (gw) — — backing off 3000ms, retrying same Idempotency-Key {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 20:24] failover (gw) — — backing off 7000ms, retrying same Idempotency-Key {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 20:24] failover (gw) — — backing off 2000ms, retrying same Idempotency-Key {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 20:24] failover (gw) — — backing off 16000ms, retrying same Idempotency-Key {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 20:24] failover (gw) — — backing off 30000ms, retrying same Idempotency-Key {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio

### FIX APPLIED (point 1, live) — feihoa 429 stall
- Symptom: "Connection error." x10 in 9 min on client; 11 stalls >39s, 16 feihoa->yolo failovers.
- Root cause: feihoa (concurrency=1) returns 429 + Retry-After:30 when busy; feihoa.ts honored the 30s, stalling the client past its timeout before failover.
- Fix: capped 429 backoff at 2s in providers/feihoa.ts so router failover (yolo, concurrency=4) engages immediately. Restarted gw-tunnel (8793). Will confirm stall count drops in next monitor windows.

### UPGRADE (point 1 v2, live) — proactive concurrency semaphore
- Replaced reactive 429-failover with a proactive in-process semaphore (feihoa concurrency=1).
- providers/feihoa.ts: feihoaSlotFree()/acquire/release; slot released on stream end/abort via wrapped body.
- router/decision: feihoa only chosen when slot free; busy → straight to yolo (session-sticky-hop preserves lock). No 429 round-trip at all.
- Verified: 2 concurrent requests → A=feihoa, B=yolo(feihoa-busy), both 200 ~25s (model latency, zero stall).
- NOTE: single Bun process = in-memory semaphore is correct. If we ever run multiple gateway instances, move to Redis (SETNX) as originally suggested.

## check 2026-09-03 21:35 — turns=2 failovers=0 cache_hit=37% max_billed=64
- no new issues

### UPGRADE (yolo semaphore, live) — 4-slot concurrency mirror
- yolo.ts: yoloSlotFree()/acquire/release (YOLO_MAX_CONCURRENCY=4), stream-safe release.
- router/decision: yolo only when yoloFree; all 4 busy → auto-redirect to hyper flash (next provider). Session-sticky-hop(yolo-busy) preserves lock.
- Verified 6 concurrent: 1 feihoa + 4 yolo + 1 hyper-flash, all 200, zero stall/429.
- Full chain now: feihoa(1) → yolo(4) → hyper flash, all semaphore-gated, no wasted 429 round-trips.

## check 2026-09-03 21:47 — turns=9 failovers=2 cache_hit=94% max_billed=6282
- [2026-09-03 21:47] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 21:47] failover (gw) — k":"99/44","raw":3,"cached":0,"ms":3257,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request

## check 2026-09-03 21:59 — turns=71 failovers=9 cache_hit=71% max_billed=15517
- [2026-09-03 21:59] failover (gw) — 160","raw":7124,"cached":7616,"ms":5043,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 21:59] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 21:59] failover (gw) — 115","raw":6608,"cached":8128,"ms":9089,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request

## check 2026-09-03 22:11 — turns=27 failovers=4 cache_hit=62% max_billed=27900
- [2026-09-03 22:11] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request

## check 2026-09-03 22:23 — turns=25 failovers=3 cache_hit=73% max_billed=20794
- [2026-09-03 22:23] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request

## check 2026-09-03 22:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

### FLIP (data-driven, live) — yolo primary, feihoa secondary
- Recalculated TPS (grown sample): yolo median 29.6 tok/s (n=107) vs feihoa 10.4 (n=85) — ~2.8x gap held.
- Flipped routeQwenSmart order: yolo primary (fast, 4 slots) → feihoa secondary (only when yolo's 4 slots busy + ctx fits 32K) → hyper flash backstop.
- session-sticky-hop(yolo-busy) now tries feihoa first, hyper last.
- Verified 5 concurrent: 4 yolo primary + 1 flash, all 200.

## check 2026-09-03 22:47 — turns=48 failovers=13 cache_hit=72% max_billed=19046
- [2026-09-03 22:47] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 22:47] tunnel-524-timeout (gw) — "tier":"flash","why":"session-sticky","tok":"5375/15","raw":5243,"cached":0,"ms":7249,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"Qwen3.8
- [2026-09-03 22:47] tunnel-524-timeout (gw) — y":"session-sticky","tok":"16021/48","raw":12328,"cached":15524,"ms":6617,"ttft":null} [feihoa] 429 — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover"

## check 2026-09-03 22:59 — turns=45 failovers=4 cache_hit=67% max_billed=18023
- [2026-09-03 22:59] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request

## check 2026-09-03 23:11 — turns=57 failovers=0 cache_hit=68% max_billed=11039
- no new issues

## check 2026-09-03 23:23 — turns=99 failovers=57 cache_hit=85% max_billed=20444
- [2026-09-03 23:23] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:23] failover (gw) — 9/65","raw":3666,"cached":896,"ms":3941,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:23] failover (gw) — 6/27","raw":3658,"cached":896,"ms":8878,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:23] failover (gw) — ent generation is still running. Please wait for i"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:23] failover (gw) — 93","raw":4832,"cached":3968,"ms":10015,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:23] failover (gw) — 06","raw":7131,"cached":4736,"ms":18582,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:23] failover (gw) — 0","raw":7016,"cached":8704,"ms":111336,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:23] failover (gw) — ","raw":10315,"cached":11712,"ms":76385,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:23] failover (gw) — 7","raw":6572,"cached":7680,"ms":134169,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:23] failover (gw) — <html class=\"no-js ie6 oldie\" lang=\"en-US\"> <!"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:23] failover (gw) — 5","raw":8276,"cached":10112,"ms":31105,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:23] failover (gw) — ","raw":10712,"cached":13440,"ms":15813,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:23] failover (gw) — ","raw":10245,"cached":11328,"ms":19627,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:23] failover (gw) — 44","raw":7237,"cached":8768,"ms":29505,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:23] failover (gw) — 3","raw":9763,"cached":10368,"ms":28737,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"{\"error\":{\"message\":\"We could not safely qu
- [2026-09-03 23:23] failover (gw) — 59","raw":5991,"cached":7552,"ms":45894,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"{\"error\":{\"message\":\"We could not safely qu
- [2026-09-03 23:23] failover (gw) — 55","raw":6633,"cached":7808,"ms":68550,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"{\"error\":{\"message\":\"We could not safely qu
- [2026-09-03 23:23] failover (gw) — not safely queue this request. No inference was st"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"{\"error\":{\"message\":\"We could not safely qu
- [2026-09-03 23:23] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 23:23] failover (gw) — nding requests faster than this plan allows. Reduc"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 23:23] failover (gw) — ","raw":10284,"cached":12096,"ms":96693,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:23] failover (gw) — 199","raw":6711,"cached":9792,"ms":9988,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:23] failover (gw) — ","raw":9414,"cached":10368,"ms":125765,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:23] failover (gw) — 1","raw":7844,"cached":10880,"ms":12032,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:23] failover (gw) — 4","raw":6619,"cached":11200,"ms":14804,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:23] failover (gw) — 98","raw":7164,"cached":11392,"ms":4394,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio

## check 2026-09-03 23:35 — turns=46 failovers=13 cache_hit=66% max_billed=12467
- [2026-09-03 23:35] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 23:35] tunnel-524-timeout (gw) — ssion-sticky","tok":"11528/53","raw":10628,"cached":0,"ms":15247,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"Qwen3.8-27B-Uncensored","tie

## check 2026-09-03 23:47 — turns=75 failovers=11 cache_hit=78% max_billed=23540
- [2026-09-03 23:47] upstream-error (gw) — \"Internal server error\",\n    \"type\": \"server_error"} [upstream feihoa] 429: {"error":{"message":"You're sending requests faster than this plan allows. Reduce the request rat
- [2026-09-03 23:47] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 23:47] failover (gw) — nding requests faster than this plan allows. Reduc"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":500,"cause":"{\n  \"error\": {\n    \"message\": \"Internal s
- [2026-09-03 23:47] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:47] failover (gw) — 3/27","raw":3648,"cached":896,"ms":8119,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:47] failover (gw) — 330/42","raw":3965,"cached":0,"ms":3697,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:47] tunnel-524-timeout (gw) — ier":"flash","why":"session-sticky-hop(feihoa-busy)","tok":"5240/221","raw":4595,"cached":1600,"ms":7278,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen
- [2026-09-03 23:47] tunnel-524-timeout (gw) — eihoa-busy)","tok":"9920/115","raw":6313,"cached":8256,"ms":5240,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3.8-27b","tier":"flash",

### Full log scan (post-flip health check)
- CLEAN: socket errors 0, upstream 5xx 0 (hyper/yolo), ledger fails 0, stream errors 0.
- feihoa 429s x176 (86 concurrency + new request-RATE limit msg "retry in 4s") — all handled by 2s backoff + failover.
- feihoa HTML-error-page 500s x18 — flaky upstream, failover to yolo covered all.
- Empty outputs x11 — ALL on feihoa (0 on yolo): 27B-Uncensored empty-content instability. Flip (yolo primary) reduces exposure.
- Post-flip: traffic now primarily yolo (fast/clean); feihoa only overflow.

## check 2026-09-03 23:59 — turns=53 failovers=13 cache_hit=66% max_billed=16939
- [2026-09-03 23:59] failover (gw) — /88","raw":6086,"cached":4358,"ms":5880,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:59] failover (gw) — <html class=\"no-js ie6 oldie\" lang=\"en-US\"> <!"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:59] failover (gw) — 223","raw":6096,"cached":4352,"ms":9854,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:59] failover (gw) — 75","raw":7530,"cached":4672,"ms":11437,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:59] failover (gw) — /117","raw":7750,"cached":896,"ms":7653,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:59] failover (gw) — 134","raw":7941,"cached":8384,"ms":6704,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:59] failover (gw) — 32","raw":8273,"cached":6656,"ms":14798,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-03 23:59] failover (gw) — 67","raw":9064,"cached":12288,"ms":4214,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-03 23:59] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-03 23:59] failover (gw) — ","raw":10637,"cached":13056,"ms":11641,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio

## check 2026-09-04 00:11 — turns=69 failovers=12 cache_hit=76% max_billed=24583
- [2026-09-04 00:11] failover (gw) — {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 00:11] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 00:11] failover (gw) — ","raw":10540,"cached":14016,"ms":27262,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 00:11] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 00:11] failover (gw) — 8/94","raw":12757,"cached":0,"ms":19944,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-04 00:11] failover (gw) — ","raw":14477,"cached":17280,"ms":15457,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-04 00:11] failover (gw) — ","raw":14587,"cached":17472,"ms":19408,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":500,"cause":"<!DOCTYPE html>\n<!--[if lt IE 7]> <html class=\
- [2026-09-04 00:11] tunnel-524-timeout (gw) — y":"session-sticky-hop(feihoa-busy)","tok":"5466/157","raw":5244,"cached":2432,"ms":9767,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen
- [2026-09-04 00:11] tunnel-524-timeout (gw) — ion-sticky","tok":"16626/1054","raw":9850,"cached":0,"ms":83524,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3.8-27b","tier":"flash","
- [2026-09-04 00:11] tunnel-524-timeout (gw) — "tier":"flash","why":"session-sticky","tok":"5388/41","raw":5244,"cached":0,"ms":80549,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"Qwen3.

## check 2026-09-04 00:23 — turns=55 failovers=9 cache_hit=75% max_billed=35528
- [2026-09-04 00:23] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request

## check 2026-09-04 00:35 — turns=94 failovers=28 cache_hit=76% max_billed=23162
- [2026-09-04 00:35] failover (gw) — 5/27","raw":3061,"cached":896,"ms":3757,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 00:35] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 00:35] failover (gw) — 36","raw":3323,"cached":3776,"ms":55256,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 00:35] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 00:35] failover (gw) — 42","raw":3328,"cached":3328,"ms":80633,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 00:35] failover (gw) — /97","raw":3704,"cached":8640,"ms":4746,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 00:35] failover (gw) — 26","raw":5309,"cached":8512,"ms":24555,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 00:35] failover (gw) — ","raw":16679,"cached":12480,"ms":11860,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 00:35] failover (gw) — 63","raw":6588,"cached":13760,"ms":6541,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 00:35] failover (gw) — 0","raw":17088,"cached":20989,"ms":5294,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 00:35] failover (gw) — 3","raw":4652,"cached":12800,"ms":11825,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 00:35] failover (gw) — nding requests faster than this plan allows. Reduc"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 00:35] failover (gw) — 1","raw":7366,"cached":14336,"ms":38106,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio

## check 2026-09-04 00:47 — turns=36 failovers=6 cache_hit=76% max_billed=33103
- [2026-09-04 00:47] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request

## check 2026-09-04 00:59 — turns=18 failovers=2 cache_hit=70% max_billed=28809
- [2026-09-04 00:59] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request

## check 2026-09-04 01:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 01:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 01:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 01:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

### Real-traffic stats snapshot (8h window, 1033 turns)
- Cache hit: 67% overall (yolo 72%, feihoa 60%) — 8.3M of 11.3M input tokens served from cache.
- Token flow: 11.3M in (8.3M cached + 3.0M fresh) + 418K out; max billed 35.5K.
- Context engine: 0 compactions / 0 livezone / 0 window-guard — sessions stayed under 32K naturally (max raw 25.8K). Engine idle = healthy.
- Session stickiness working: 524 of 698 turns sticky (cache reuse), 166 recovered via failover, 174 busy-hops (semaphore working).

### Latency analysis (parallel agents "slow" report)
- 2 parallel agents = max 2 concurrent requests; total capacity 5 slots (yolo 4 + feihoa 1) → NO queuing expected, confirmed (only 1/6 sessions had back-to-back slow turns).
- Per-lane latency: yolo p50=13s p90=57s; feihoa p50=9.7s p90=35s. These are INHERENT model generation times (27B model, non-streaming requests) — not waiting.
- ROOT CAUSE of "slow" perception: (1) 146 turns took >30s — that's generation time of large outputs on 27B models (out-TPS 10-30), not queue-wait; (2) failover path adds 2s backoff + retry → failover turns p50=20.6s vs direct 9.7s.
- TTFT: 0 tracked = ALL requests are NON-STREAMING. Client waits for the ENTIRE generation before seeing any token. A 60-token response at 15 TPS = 4s invisible wait; 500-token = 33s wait. This is the biggest UX factor — non-streaming makes everything FEEL slow.
- RECOMMENDATION for other agent: use stream:true. With streaming + our SSE keepalive, user sees tokens flowing in ~1-2s instead of waiting 10-60s blind.

## check 2026-09-04 01:59 — turns=32 failovers=1 cache_hit=70% max_billed=14237
- [2026-09-04 01:59] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 01:59] tunnel-524-timeout (gw) — "tier":"flash","why":"session-sticky","tok":"6202/75","raw":5245,"cached":5213,"ms":4173,"ttft":null} [feihoa] 429 — short backoff 2000ms, then failover if still busy {"ev":"backch

## check 2026-09-04 02:11 — turns=125 failovers=93 cache_hit=73% max_billed=24099
- [2026-09-04 02:11] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — 911/15","raw":3649,"cached":0,"ms":5527,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — /75","raw":3648,"cached":896,"ms":14543,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — nding requests faster than this plan allows. Reduc"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — 46","raw":4585,"cached":3904,"ms":15309,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — /56","raw":7730,"cached":3925,"ms":7879,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — — short backoff 1000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — /94","raw":7053,"cached":6016,"ms":7713,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — 164","raw":7216,"cached":8192,"ms":6600,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — — short backoff 1000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — 94","raw":7524,"cached":8960,"ms":13058,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — 80","raw":8843,"cached":5888,"ms":53923,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — 32","raw":8628,"cached":9408,"ms":15790,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — 40","raw":8324,"cached":10251,"ms":7833,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — 9","raw":8752,"cached":10624,"ms":23088,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — 40","raw":7192,"cached":5504,"ms":29887,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:11] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — ent generation is still running. Please wait for i"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — ","raw":11053,"cached":14144,"ms":12566,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — 8","raw":9913,"cached":12416,"ms":80584,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — ","raw":10095,"cached":13504,"ms":11217,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — 8/27","raw":3394,"cached":896,"ms":9795,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — 53","raw":4197,"cached":3712,"ms":11836,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — 185","raw":7955,"cached":4672,"ms":9200,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — 82","raw":8979,"cached":9536,"ms":33816,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — 0","raw":9350,"cached":8704,"ms":123464,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — 84","raw":6327,"cached":4864,"ms":25656,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — 1","raw":9572,"cached":10304,"ms":74763,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — 84","raw":5244,"cached":6656,"ms":13013,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] failover (gw) — 6","raw":9138,"cached":10752,"ms":17719,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:11] tunnel-524-timeout (gw) — ":"session-sticky-hop(feihoa-busy)","tok":"9585/294","raw":7524,"cached":8960,"ms":13058,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":
- [2026-09-04 02:11] tunnel-524-timeout (gw) — e\":\"rate_limit\"}})","tok":"6142/166","raw":5372,"cached":5248,"ms":12703,"ttft":null} [feihoa] 429 — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failove
- [2026-09-04 02:11] tunnel-524-timeout (gw) — limit\"}})","tok":"11028/139","raw":9114,"cached":9536,"ms":52488,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3.8-27b","tier":"flash"
- [2026-09-04 02:11] tunnel-524-timeout (gw) — e\":\"account_concurrency_limit\"}})","tok":"6792/84","raw":5244,"cached":6656,"ms":13013,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause"

## check 2026-09-04 02:23 — turns=118 failovers=45 cache_hit=73% max_billed=25118
- [2026-09-04 02:23] failover (gw) — 5","raw":8975,"cached":10112,"ms":50606,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:23] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:23] failover (gw) — 93","raw":5516,"cached":6784,"ms":52696,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:23] failover (gw) — 45","raw":7734,"cached":7360,"ms":63396,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:23] failover (gw) — ","raw":11111,"cached":11136,"ms":98968,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:23] failover (gw) — 3","raw":9446,"cached":12224,"ms":49405,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:23] failover (gw) — ","raw":12485,"cached":10904,"ms":11695,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:23] failover (gw) — nding requests faster than this plan allows. Reduc"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:23] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:23] failover (gw) — ent generation is still running. Please wait for i"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:23] failover (gw) — 73","raw":5518,"cached":5056,"ms":10618,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:23] failover (gw) — ","raw":13725,"cached":17664,"ms":13533,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:23] failover (gw) — ","raw":11809,"cached":12352,"ms":15137,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:23] failover (gw) — ","raw":11836,"cached":13312,"ms":15449,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:23] failover (gw) — 5","raw":9537,"cached":15360,"ms":19257,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:23] failover (gw) — 2/69","raw":13768,"cached":0,"ms":27566,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:23] failover (gw) — ","raw":14574,"cached":23168,"ms":11311,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:23] failover (gw) — /74","raw":7843,"cached":2368,"ms":4267,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:23] tunnel-524-timeout (gw) — r":"flash","why":"session-sticky-hop(feihoa-busy)","tok":"21524/1263","raw":14013,"cached":20672,"ms":20582,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 02:23] tunnel-524-timeout (gw) — icky-hop(feihoa-busy)","tok":"6039/128","raw":5215,"cached":5248,"ms":4937,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"Qwen3.8-27B-Uncens
- [2026-09-04 02:23] stream/dispatch-error (gw) — u're sending requests faster than this plan allows. Reduc"} [dispatch feihoa] attempt 1 failed (The socket connection was closed unexpectedly. For more info), retrying {"ev":"turn"

## check 2026-09-04 02:35 — turns=98 failovers=11 cache_hit=76% max_billed=30557
- [2026-09-04 02:35] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:35] failover (gw) — 3","raw":19280,"cached":17024,"ms":9832,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:35] failover (gw) — /69","raw":5485,"cached":2432,"ms":9211,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:35] failover (gw) — 63","raw":6846,"cached":7360,"ms":10408,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:35] tunnel-524-timeout (gw) — a-busy)","tok":"21362/607","raw":17356,"cached":18496,"ms":15241,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"Qwen3.8-27B-Uncensored","tie

## check 2026-09-04 02:47 — turns=101 failovers=66 cache_hit=74% max_billed=26404
- [2026-09-04 02:47] upstream-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [upstream yolo] 502: {   "error": {     "message": "Network connection lost.",     "type": "server_error",     "param":
- [2026-09-04 02:47] upstream-error (gw) — u're sending requests faster than this plan allows. Reduc"} [upstream feihoa] 429: {"error":{"message":"Your current generation is still running. Please wait for it to finish befor
- [2026-09-04 02:47] failover (gw) — ","raw":14768,"cached":16256,"ms":26958,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"{\n  \"error\": {\n    \"message\": \"Network co
- [2026-09-04 02:47] failover (gw) — 253/27","raw":3023,"cached":0,"ms":3464,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] failover (gw) — ent generation is still running. Please wait for i"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] failover (gw) — /122","raw":3226,"cached":896,"ms":5534,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] failover (gw) — /67","raw":3222,"cached":3200,"ms":7277,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:47] failover (gw) — nding requests faster than this plan allows. Reduc"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:47] failover (gw) — 74","raw":5175,"cached":6144,"ms":14233,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:47] failover (gw) — 7","raw":4420,"cached":3520,"ms":124160,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:47] failover (gw) — 63","raw":5218,"cached":6144,"ms":29597,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] failover (gw) — /1706","raw":4451,"cached":0,"ms":50928,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] failover (gw) — 5","raw":5295,"cached":4928,"ms":171002,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] failover (gw) — /88","raw":5467,"cached":6528,"ms":8726,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] failover (gw) — ","raw":18078,"cached":14309,"ms":13902,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:47] failover (gw) — 97","raw":4949,"cached":9984,"ms":27080,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:47] failover (gw) — 1","raw":5357,"cached":6656,"ms":102413,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:47] failover (gw) — 55","raw":5692,"cached":4864,"ms":13826,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:47] failover (gw) — 54/83","raw":8373,"cached":0,"ms":16435,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:47] failover (gw) — 5","raw":5573,"cached":12544,"ms":12419,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] failover (gw) — 3","raw":13951,"cached":6528,"ms":49990,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] failover (gw) — 4","raw":5345,"cached":6656,"ms":136407,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:47] failover (gw) — 0","raw":14621,"cached":18752,"ms":8966,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:47] tunnel-524-timeout (gw) — m\":null,\"code\":\"rate_limit\"}})","tok":"6520/103","raw":5246,"cached":6400,"ms":21056,"ttft":null} [feihoa] 429 — short backoff 2000ms, then failover if still busy {"ev":"backc
- [2026-09-04 02:47] tunnel-524-timeout (gw) — ier":"flash","why":"session-sticky","tok":"13479/52","raw":5524,"cached":0,"ms":19736,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3.8

## check 2026-09-04 02:59 — turns=112 failovers=89 cache_hit=76% max_billed=27227
- [2026-09-04 02:59] failover (gw) — ","raw":14720,"cached":19264,"ms":22949,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:59] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:59] failover (gw) — ent generation is still running. Please wait for i"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:59] failover (gw) — 755/27","raw":3400,"cached":0,"ms":3939,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:59] failover (gw) — 4/27","raw":3398,"cached":896,"ms":6812,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:59] failover (gw) — 94","raw":6495,"cached":4352,"ms":19792,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:59] failover (gw) — 1","raw":9625,"cached":10432,"ms":60767,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:59] failover (gw) — 7","raw":8521,"cached":12352,"ms":18902,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:59] failover (gw) — 33","raw":6617,"cached":5120,"ms":39581,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:59] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:59] failover (gw) — nding requests faster than this plan allows. Reduc"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:59] failover (gw) — 16","raw":3730,"cached":3968,"ms":15029,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:59] failover (gw) — 05/71","raw":5197,"cached":0,"ms":14103,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:59] failover (gw) — — short backoff 1000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:59] failover (gw) — 4","raw":10460,"cached":22656,"ms":8986,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 02:59] failover (gw) — ","raw":10094,"cached":14464,"ms":20201,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 02:59] failover (gw) — 61","raw":8044,"cached":7296,"ms":18669,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio

## check 2026-09-04 03:11 — turns=109 failovers=37 cache_hit=80% max_billed=24141
- [2026-09-04 03:11] failover (gw) — 110","raw":6271,"cached":8512,"ms":8402,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 03:11] failover (gw) — /69","raw":4436,"cached":2240,"ms":6855,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 03:11] failover (gw) — ent generation is still running. Please wait for i"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 03:11] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 03:11] failover (gw) — 34","raw":8361,"cached":9856,"ms":44996,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 03:11] failover (gw) — 07","raw":5738,"cached":6848,"ms":14366,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 03:11] failover (gw) — 78","raw":6328,"cached":10496,"ms":7067,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 03:11] failover (gw) — 12","raw":5888,"cached":6976,"ms":13605,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 03:11] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 03:11] failover (gw) — 7","raw":7620,"cached":10752,"ms":11942,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 03:11] failover (gw) — 5","raw":14621,"cached":16448,"ms":4140,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 03:11] failover (gw) — 11","raw":7523,"cached":8896,"ms":15111,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request

## check 2026-09-04 03:23 — turns=55 failovers=5 cache_hit=77% max_billed=24557
- [2026-09-04 03:23] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 03:23] tunnel-524-timeout (gw) — a-busy)","tok":"19667/808","raw":16128,"cached":19328,"ms":25240,"ttft":null}

## check 2026-09-04 03:35 — turns=12 failovers=0 cache_hit=67% max_billed=10755
- no new issues

## check 2026-09-04 03:47 — turns=37 failovers=21 cache_hit=73% max_billed=13041
- [2026-09-04 03:47] failover (gw) — 739/27","raw":3381,"cached":0,"ms":3233,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 03:47] failover (gw) — ent generation is still running. Please wait for i"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 03:47] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"Your current generatio
- [2026-09-04 03:47] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 03:47] failover (gw) — 21","raw":6805,"cached":4416,"ms":13443,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 03:47] failover (gw) — nding requests faster than this plan allows. Reduc"} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request

## check 2026-09-04 03:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 04:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 04:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 04:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 04:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 04:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 05:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 05:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 05:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 05:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 05:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 06:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 06:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 06:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 06:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 06:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 07:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 07:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 07:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 07:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 07:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 08:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 08:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 08:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 08:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 08:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 09:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 09:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 09:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 09:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 09:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 10:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 10:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 10:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 10:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 10:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 11:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 11:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 11:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

### FIX (agent concern #2: weak fix-capability) — routing was the bug, live now
- Evidence: 1,042 real-traffic turns, 100% on 27B lanes (yolo+feihoa), qwen3.8-max = 0 turns. Union-narrowing TS errors survived 8 fix rounds because frontier model never saw them.
- Root causes: (1) classifyHardness had no fix/repair/type-error patterns — "fix the TS2339 error" classified ROUTINE; (2) sticky path never re-evaluated hardness — first routine turn locked session to 27B forever.
- Fix 1: HARD_PATTERNS + fix/repair/resolve+error/type/TSxxxx/compile/build patterns (9/9 unit-tested incl. false-positive checks).
- Fix 2: sticky-escalate — hard/fix turn on a 27B-locked session hops THIS turn to qwen3.8-max (lock preserved for cache; routine turns return to free lane).
- Verified live: same session — T1 "say hi" -> yolo(27b); T2 "fix the TS2339 error" -> qwen3.8-max via sticky-escalate(debugging). Both 200.
- Related: quota wall hit during testing (both test users at 20M cap) — upgraded subscriptions to advanced (40M) for continued testing.

## check 2026-09-04 11:47 — turns=2 failovers=0 cache_hit=0% max_billed=113
- no new issues

## check 2026-09-04 11:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 12:11 — turns=1 failovers=0 cache_hit=98% max_billed=65
- no new issues

## check 2026-09-04 12:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 12:35 — turns=1 failovers=0 cache_hit=98% max_billed=65
- no new issues

## check 2026-09-04 12:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 12:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 13:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

### Switchyard routers implemented (Stage + LLM Judge), live-verified
- Stage Router (lib/stage-router.ts): detects agent phase from live-zone tool activity — EXPLORE (failing tests, TS errors, exit!=0 → escalate to frontier) vs MECHANICAL (tests green, builds clean → cheap lane). 6/6 unit tests. Verified: failing-tests turn -> qwen3.8-max; green-tests turn -> yolo.
- LLM Judge (lib/llm-judge.ts): inconclusive routine prompts ("make it robust", "edge cases", "whats wrong") get one cheap yolo classify (reasoning off, ~6s) before settling on free lane. Fail-open (null -> heuristic). Verified: "make the input parsing robust" -> judge verdict=TRUE -> qwen3.8-max.
- Learnings: feihoa too slow for judge (16-19s for 1-word); qwen reasoning eats max_tokens (content null) unless reasoning_effort:none; feihoa idempotency keys must be unique per call (409 on replay).

## check 2026-09-04 13:23 — turns=1 failovers=0 cache_hit=0% max_billed=109
- no new issues

## check 2026-09-04 13:35 — turns=9 failovers=0 cache_hit=41% max_billed=6019
- no new issues

## check 2026-09-04 13:47 — turns=94 failovers=0 cache_hit=56% max_billed=12464
- [2026-09-04 13:47] stream/dispatch-error (gw) — [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 13:47] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 13:47] stream/dispatch-error (gw) — 090/1808","raw":4543,"cached":4224,"ms":312230,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 13:47] stream/dispatch-error (gw) — 06/10748","raw":5934,"cached":6272,"ms":499349,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 13:47] stream/dispatch-error (gw) — :"8474/128","raw":7043,"cached":4224,"ms":5427,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7

## check 2026-09-04 13:59 — turns=250 failovers=0 cache_hit=69% max_billed=33828
- [2026-09-04 13:59] tunnel-524-timeout (gw) — x","tier":"full","why":"sticky-escalate(debugging)","tok":"7524/2462","raw":6245,"cached":4224,"ms":59493,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwe
- [2026-09-04 13:59] tunnel-524-timeout (gw) — -busy)","tok":"19557/1060","raw":10735,"cached":18432,"ms":15244,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3.8-flash","tier":"flash
- [2026-09-04 13:59] stream/dispatch-error (gw) — cted {\"from\":\"2024-01-02T00:00:00Z\",\"to\":\"2024-01-…" [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 13:59] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 13:59] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 13:59] stream/dispatch-error (gw) — "12794/86","raw":7436,"cached":10496,"ms":4395,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 13:59] stream/dispatch-error (gw) — 152/4710","raw":7723,"cached":2048,"ms":390114,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 13:59] stream/dispatch-error (gw) — 19243/170","raw":6581,"cached":17408,"ms":4319,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 13:59] stream/dispatch-error (gw) — 16829/144","raw":6782,"cached":16640,"ms":3861,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 13:59] stream/dispatch-error (gw) — 5085/650","raw":11542,"cached":14336,"ms":8748,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 13:59] stream/dispatch-error (gw) — 28/5376","raw":14479,"cached":18432,"ms":67770,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7

## check 2026-09-04 14:11 — turns=323 failovers=0 cache_hit=71% max_billed=82508
- [2026-09-04 14:11] upstream-error (gw) — 10239/206","raw":9587,"cached":7168,"ms":10846,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — ":"8383/99","raw":7447,"cached":7168,"ms":3291,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — :"11264/108","raw":7904,"cached":896,"ms":7588,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — :"7787/145","raw":6712,"cached":896,"ms":10378,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — ":"11965/145","raw":11284,"cached":0,"ms":5591,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — "7249/123","raw":6482,"cached":6144,"ms":13932,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — in a few minutes.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — SD', lastSyncedAt: '2024-06-20T09:30:00Z' },\n { id: 'sav…" [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 11682/284","raw":10794,"cached":896,"ms":15590,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 12939/87","raw":9946,"cached":11648,"ms":14239,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 2428/394","raw":11649,"cached":7424,"ms":19702,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — :"9574/106","raw":8912,"cached":8320,"ms":3329,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 12186/91","raw":10415,"cached":10240,"ms":8121,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — "9182/262","raw":7861,"cached":7168,"ms":10176,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — :"9167/118","raw":8087,"cached":8320,"ms":3562,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 12303/64","raw":10446,"cached":11264,"ms":6152,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 4270/190","raw":12317,"cached":12288,"ms":5172,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 6705/170","raw":14201,"cached":15360,"ms":4220,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 4783/86","raw":11675,"cached":12288,"ms":13272,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 5272/124","raw":12878,"cached":14976,"ms":3516,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 5052/110","raw":12834,"cached":14336,"ms":4228,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 3658/195","raw":11286,"cached":11648,"ms":5087,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 92/1993","raw":14881,"cached":16640,"ms":21275,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 14506/74","raw":12963,"cached":14336,"ms":8419,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 8602/373","raw":13970,"cached":15360,"ms":7763,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 5876/68","raw":12580,"cached":15360,"ms":14702,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 992/940","raw":13577,"cached":12288,"ms":15430,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — "20476/1335","raw":15538,"cached":0,"ms":33583,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 672/929","raw":13463,"cached":14208,"ms":44610,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 2240/546","raw":18056,"cached":14336,"ms":8444,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] upstream-error (gw) — 9551/119","raw":16086,"cached":18432,"ms":3523,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:11] tunnel-524-timeout (gw) — qwen3.8-27b","tier":"flash","why":"session-sticky","tok":"15524/154","raw":14201,"cached":14656,"ms":7903,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwe
- [2026-09-04 14:11] tunnel-524-timeout (gw) — hoa-busy)","tok":"19560/80","raw":13162,"cached":16640,"ms":5244,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3.8-flash","tier":"flash
- [2026-09-04 14:11] tunnel-524-timeout (gw) — -busy)","tok":"22844/4054","raw":19137,"cached":21504,"ms":45242,"ttft":null} [prefix-lint] ccf19648-d4c0-400e-b82c-8ed78ceced06: volatile:iso-timestamp in tool[32]: "…SD', lastSyn
- [2026-09-04 14:11] tunnel-524-timeout (gw) — "flash","why":"session-sticky-hop(yolo+feihoa-busy)","tok":"52410/197","raw":39942,"cached":34944,"ms":7633,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 14:11] tunnel-524-timeout (gw) — bugging)","tok":"40233/5090","raw":25362,"cached":0,"ms":123524,"ttft":null} [prefix-lint] ccf19648-d4c0-400e-b82c-8ed78ceced06: volatile:iso-timestamp in tool[16]: "…SD', lastSync
- [2026-09-04 14:11] stream/dispatch-error (gw) — SD', lastSyncedAt: '2024-06-20T09:30:00Z' },\n { id: 'sav…" [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 14:11] stream/dispatch-error (gw) — 57/2417","raw":19555,"cached":25600,"ms":26284,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 14:11] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 14:11] stream/dispatch-error (gw) — SD', lastSyncedAt: '2024-06-20T09:30:00Z' },\n { id: 'sav…" [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 14:11] stream/dispatch-error (gw) — SD', lastSyncedAt: '2024-06-20T09:30:00Z' },\n { id: 'sav…" [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 14:11] stream/dispatch-error (gw) — 454/930","raw":21258,"cached":33408,"ms":28529,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation

## check 2026-09-04 14:23 — turns=305 failovers=0 cache_hit=77% max_billed=90480
- [2026-09-04 14:23] upstream-error (gw) — )","tok":"102/30","raw":8,"cached":0,"ms":1880,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:23] upstream-error (gw) — 8107/134","raw":15891,"cached":13312,"ms":4839,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 14:23] tunnel-524-timeout (gw) — n3.8-27b","tier":"flash","why":"session-sticky","tok":"6833/524","raw":6506,"cached":896,"ms":31369,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8"
- [2026-09-04 14:23] stream/dispatch-error (gw) — [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 14:23] stream/dispatch-error (gw) — 44/22673","raw":4438,"cached":4096,"ms":577335,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operatio
- [2026-09-04 14:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"
- [2026-09-04 14:23] stream/dispatch-error (gw) — ky","tok":"64/33","raw":8,"cached":0,"ms":4335,"ttft":null} [dispatch hyper] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"
- [2026-09-04 14:23] stream/dispatch-error (gw) — :"8148/103","raw":7343,"cached":3072,"ms":3953,"ttft":null} [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 14:23] stream/dispatch-error (gw) — 9828/161","raw":17447,"cached":17408,"ms":4418,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 14:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation t
- [2026-09-04 14:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 14:23] stream/dispatch-error (gw) — 286/973","raw":30109,"cached":29568,"ms":35181,"ttft":null} [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation t
- [2026-09-04 14:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation t
- [2026-09-04 14:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation ti
- [2026-09-04 14:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation t
- [2026-09-04 14:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 14:23] stream/dispatch-error (gw) — 22126/96","raw":19106,"cached":21632,"ms":4176,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7

## check 2026-09-04 14:35 — turns=155 failovers=2 cache_hit=77% max_billed=26662
- [2026-09-04 14:35] upstream-error (gw) — 80/1668","raw":16683,"cached":17408,"ms":18691,"ttft":null} [upstream hyper] 502:  <html><head> <meta http-equiv="content-type" content="text/html;charset=utf-8"> <title>502 Server
- [2026-09-04 14:35] upstream-error (gw) — ":"13648/152","raw":11225,"cached":0,"ms":6119,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m39s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 17824/247","raw":15229,"cached":6272,"ms":8103,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m37s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m37s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m37s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m37s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m36s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m36s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m36s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m36s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m34s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m34s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m34s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m34s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m31s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 4803/663","raw":12752,"cached":9344,"ms":25948,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m30s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m30s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m30s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m30s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m29s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m29s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m29s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m29s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m26s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m26s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m26s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m26s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m25s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m25s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m25s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m25s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m24s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m24s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m23s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m23s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m22s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m22s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m22s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 356/300","raw":11890,"cached":12800,"ms":19253,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m21s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m21s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m21s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m21s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m20s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m20s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m19s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m19s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m18s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m18s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m18s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m18s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m17s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m17s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m17s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m17s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m16s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m16s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m13s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m13s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 3m13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m11s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — ":"3292/27","raw":3069,"cached":896,"ms":12653,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m9s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 3m9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m8s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 3m8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m7s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 3m7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m5s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 3m5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m4s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 3m4s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m3s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 3m3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m3s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 3m3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m2s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 3m2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m1s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 3m1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m0s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 3m0s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3m0s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 3m0s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m59s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m59s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m58s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m58s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m56s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m56s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m55s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m55s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m55s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m55s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m54s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m54s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m52s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m52s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m51s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m51s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m48s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m48s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m47s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m47s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m46s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m46s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m44s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m44s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m43s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m43s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m41s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m41s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m39s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 87/17341","raw":4896,"cached":5120,"ms":553599,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m36s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — ":"3287/29","raw":3071,"cached":896,"ms":34325,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m29s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m29s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m26s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 8789/5040","raw":7793,"cached":896,"ms":159377,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m16s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m16s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m15s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — :"8275/104","raw":7669,"cached":8256,"ms":6525,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m13s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m13s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m12s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 13879/116","raw":10782,"cached":1600,"ms":6169,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m9s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 2m9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m8s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 2m8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m8s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — 14126/41","raw":10949,"cached":13824,"ms":4079,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m3s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ispatch hyper] connection failure: The operation timed out. [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m3s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 2m3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m2s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 2m2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m1s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 2m1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m0s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 2m0s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m0s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 2m0s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m58s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 5076/160","raw":13015,"cached":13888,"ms":7859,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m56s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 14216/46","raw":11004,"cached":14080,"ms":9484,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m55s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 1m55s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m55s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — ":"3291/29","raw":3068,"cached":3264,"ms":2994,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m54s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 1m54s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m53s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 1m53s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m53s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 1m53s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m52s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 14268/51","raw":11015,"cached":14208,"ms":3865,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m51s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 1m51s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m47s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 5881/131","raw":13659,"cached":15040,"ms":7903,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m46s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 14333/52","raw":11038,"cached":14208,"ms":7247,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m39s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 1m39s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m36s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — 072/186","raw":13741,"cached":15872,"ms":12444,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m31s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — x","to":"qwen3.8-flash","cause":"The operation timed out."} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m2s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — x","to":"qwen3.8-flash","cause":"The operation timed out."} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m1s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — 14601/46","raw":11130,"cached":14528,"ms":9733,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 50s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 50s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 49s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — 6996/153","raw":14135,"cached":16704,"ms":9100,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 47s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 47s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 46s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — 4668/54","raw":11153,"cached":14592,"ms":10226,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 43s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — ":"3295/80","raw":3078,"cached":3264,"ms":5329,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 42s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 42s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 38s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 38s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 39s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 39s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 35s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 35s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 34s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 34s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 32s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 32s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 30s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 30s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 28s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 28s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 27s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 27s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 27s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 27s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 26s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 26s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 25s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 25s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 25s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 25s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 24s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 24s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 25s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 25s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 23s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 23s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 22s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 22s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 21s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 21s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 20s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 20s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 20s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 20s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 19s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 19s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 18s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 18s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 17s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 17s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 17s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — \"Network connection lost.\",\n    \"type\": \"server_er"} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 15s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 15s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 15s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 15s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 14s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 14s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 14s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 14s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 13s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 13s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 11s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 11s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 9s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 8s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 7s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 7s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 5s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 4s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 4s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 4s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 2s.","type":"rate_limit_error","code":null}}  [upstream yolo] 502: {   "error": {     "message": "Network connection lost.",     "type": "server_error",     "param":
- [2026-09-04 14:35] upstream-error (gw) — quest_id": "req_07c62a74-37e9-4478-ab11-713902a42c6c"   } } [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 5s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 5s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 22s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 21s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 21s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 21s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 19s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 19s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 19s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 17s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 16s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 16s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 16s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 16s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 15s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 14s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 12s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 12s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 12s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 12s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 11s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 10s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 10s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 10s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 10s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 9s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 9s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 7s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 6s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — try again in 6s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 5s.","type":"rate_limi
- [2026-09-04 14:35] upstream-error (gw) — 87/21593","raw":4898,"cached":5120,"ms":543589,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m16s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 1m16s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m14s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 1m14s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m10s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 1m10s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m9s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 1m9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m8s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 1m8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m7s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 1m7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m5s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 1m5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m3s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 1m3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m0s.","type":"rate_li
- [2026-09-04 14:35] upstream-error (gw) — ry again in 1m0s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 58s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 58s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 56s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — ispatch hyper] connection failure: The operation timed out. [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 54s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 54s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 51s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 51s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 50s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 50s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 48s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 48s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 48s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 48s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 47s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 46s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 45s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 45s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 45s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 45s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 44s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 44s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 43s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 43s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 43s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 43s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 42s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 42s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 41s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 41s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 40s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 40s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 39s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 39s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 39s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 39s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 38s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 38s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 38s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 38s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 36s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 36s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 35s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 35s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 35s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 34s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 34s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 34s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 33s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 33s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 32s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 32s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 31s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 31s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 31s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — try again in 31s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 28s.","type":"rate_lim
- [2026-09-04 14:35] upstream-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m43s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m43s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m40s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m40s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m36s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m36s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m35s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m35s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m33s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m33s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m31s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m31s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m30s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m30s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m29s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m29s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m28s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m28s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m27s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m27s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m24s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m24s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m23s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m23s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m23s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m23s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m22s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m22s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m22s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m22s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m20s.","type":"rate_l
- [2026-09-04 14:35] upstream-error (gw) — y again in 2m20s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m20s.","type":"rate_l
- [2026-09-04 14:35] failover (gw) — 7637","raw":4913,"cached":0,"ms":259152,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} [dispatch
- [2026-09-04 14:35] failover (gw) — in in 17s.","type":"rate_limit_error","code":null}}  {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"{\n  \"error\": {\n    \"message\": \"Network co
- [2026-09-04 14:35] stream/dispatch-error (gw) — "status":502,"cause":"connection:The operation timed out."} [dispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out
- [2026-09-04 14:35] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 14:35] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operatio
- [2026-09-04 14:35] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out
- [2026-09-04 14:35] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [feihoa] 429 — short backoff 2000ms, then failove
- [2026-09-04 14:35] stream/dispatch-error (gw) — 3936/93","raw":12249,"cached":8256,"ms":533251,"ttft":null} [dispatch yolo] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 14:35] stream/dispatch-error (gw) — "5485/25951","raw":4900,"cached":0,"ms":222965,"ttft":null} [dispatch hyper] connection failure: The operation timed out. [dispatch hyper] connection failure: The operation timed o
- [2026-09-04 14:35] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out
- [2026-09-04 14:35] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 14:35] stream/dispatch-error (gw) — ":"7911/97","raw":7279,"cached":3264,"ms":5902,"ttft":null} [dispatch hyper] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"
- [2026-09-04 14:35] stream/dispatch-error (gw) — "10863/94","raw":9633,"cached":9664,"ms":33421,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 14:35] stream/dispatch-error (gw) — ry again in 2m3s.","type":"rate_limit_error","code":null}}  [dispatch hyper] connection failure: The operation timed out. [dispatch hyper] connection failure: The operation timed o
- [2026-09-04 14:35] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch hyper] connection failure: The operation timed out. [upstream hyper] 429: {"error":{"message":"You've hit your
- [2026-09-04 14:35] stream/dispatch-error (gw) — try again in 56s.","type":"rate_limit_error","code":null}}  [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operatio
- [2026-09-04 14:35] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operation timed out. [upstream hyper] 429: {"error":{"message":"You've hit your
- [2026-09-04 14:35] stream/dispatch-error (gw) — ode":null}}  SyntaxError: JSON Parse error: Unexpected EOF  [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [upstream hyper] 429: {"error":{"message":"You've

## check 2026-09-04 14:47 — turns=146 failovers=0 cache_hit=67% max_billed=26079
- [2026-09-04 14:47] upstream-error (gw) — on :8793 Started development server: http://localhost:8793 [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 54s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 54s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 51s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 51s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 46s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 46s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 41s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 41s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 38s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 38s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 33s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 33s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 27s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 27s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 24s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 19s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 19s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 40s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 40s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 26s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 26s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 23s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 23s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 18s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 18s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 6s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 6s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 20s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 20s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 14s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 14s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 11s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 11s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 8s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 7s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 9s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 6s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 6s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m44s.","type":"rate_l
- [2026-09-04 14:47] upstream-error (gw) — y again in 1m44s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m43s.","type":"rate_l
- [2026-09-04 14:47] upstream-error (gw) — y again in 1m43s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m41s.","type":"rate_l
- [2026-09-04 14:47] upstream-error (gw) — y again in 1m41s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m40s.","type":"rate_l
- [2026-09-04 14:47] upstream-error (gw) — y again in 1m40s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m39s.","type":"rate_l
- [2026-09-04 14:47] upstream-error (gw) — y again in 1m39s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m37s.","type":"rate_l
- [2026-09-04 14:47] upstream-error (gw) — y again in 1m37s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m36s.","type":"rate_l
- [2026-09-04 14:47] upstream-error (gw) — y again in 1m36s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m32s.","type":"rate_l
- [2026-09-04 14:47] upstream-error (gw) — y again in 1m32s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 49s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 49s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 47s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 47s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 47s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 47s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 45s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 45s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 42s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 42s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 40s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 40s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 18s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 18s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 16s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 16s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 11s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m4s.","type":"rate_li
- [2026-09-04 14:47] upstream-error (gw) — ry again in 1m4s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m3s.","type":"rate_li
- [2026-09-04 14:47] upstream-error (gw) — ry again in 1m3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m1s.","type":"rate_li
- [2026-09-04 14:47] upstream-error (gw) — ry again in 1m1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 58s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 58s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 58s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 58s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 56s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 56s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 53s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 53s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 51s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 51s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 48s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 48s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 46s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 46s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 38s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 38s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 37s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 37s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 34s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 34s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 29s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 29s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 23s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 23s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 20s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — tok":"3271/33","raw":3062,"cached":0,"ms":2866,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 23s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — tok":"3278/90","raw":3062,"cached":0,"ms":4976,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 20s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 20s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 20s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 20s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 19s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 19s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 17s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 17s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 17s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — ":"8409/135","raw":7920,"cached":896,"ms":9149,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 13s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 13s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 12s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 12s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — k":"9578/81","raw":8820,"cached":896,"ms":5994,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 9s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 8s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 8s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — :"9137/252","raw":8633,"cached":8384,"ms":8615,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 6s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 6s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 6s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — :"8410/109","raw":7930,"cached":3264,"ms":8478,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 4s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 4s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — :"9572/167","raw":8541,"cached":896,"ms":11243,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — k":"10258/125","raw":9814,"cached":0,"ms":4545,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 6s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — 14378/139","raw":11233,"cached":3712,"ms":7336,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 5s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — "10681/94","raw":10325,"cached":3328,"ms":3744,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — 15/1338","raw":14640,"cached":15552,"ms":57020,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:47] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 23s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — 14388/92","raw":11227,"cached":8320,"ms":13856,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 21s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 21s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 21s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — 227/117","raw":11124,"cached":12288,"ms":15218,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 19s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 19s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 18s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 18s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 18s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 18s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 15s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 15s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 15s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 15s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 14s.","type":"rate_lim
- [2026-09-04 14:47] upstream-error (gw) — try again in 14s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 12s.","type":"rate_lim
- [2026-09-04 14:47] tunnel-524-timeout (gw) — a-busy)","tok":"17346/387","raw":14879,"cached":16384,"ms":6524,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3.8-27b","tier":"flash","

## check 2026-09-04 14:59 — turns=205 failovers=2 cache_hit=77% max_billed=30910
- [2026-09-04 14:59] upstream-error (gw) — [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 14:59] upstream-error (gw) — try again in 11s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 8s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 8s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 6s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 499/322","raw":13352,"cached":14336,"ms":28809,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — ":"3287/33","raw":3071,"cached":3264,"ms":3079,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 9487/157","raw":16009,"cached":18128,"ms":6607,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — ":"4531/48","raw":4265,"cached":1024,"ms":2569,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 18373/80","raw":15006,"cached":17408,"ms":3474,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — ":"8936/95","raw":8148,"cached":8320,"ms":3071,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 0798/129","raw":16297,"cached":14336,"ms":6182,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 2593/126","raw":11117,"cached":9984,"ms":15670,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 6533/207","raw":15758,"cached":8704,"ms":26792,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — :"8741/165","raw":8502,"cached":8320,"ms":3879,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 4s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 4s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 4s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 4s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 8223/204","raw":17255,"cached":14336,"ms":4677,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 465/1566","raw":15593,"cached":8448,"ms":36579,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — SD', lastSyncedAt: '2024-06-20T09:30:00Z' },\n { id: 'sav…" [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 8073/128","raw":15824,"cached":12544,"ms":8424,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 78/1623","raw":24601,"cached":12672,"ms":41418,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 0159/166","raw":19202,"cached":17408,"ms":4356,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 4s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 823/442","raw":19407,"cached":17728,"ms":18424,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 2666/191","raw":18991,"cached":19728,"ms":7604,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 4059/253","raw":19808,"cached":20480,"ms":5741,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — ok":"9546/134","raw":8541,"cached":0,"ms":3721,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — :"4732/150","raw":4389,"cached":4096,"ms":3026,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — :"9592/125","raw":9227,"cached":8768,"ms":5606,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — "11741/88","raw":11235,"cached":8320,"ms":3555,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 11404/198","raw":10175,"cached":9216,"ms":3981,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 27773/80","raw":22114,"cached":15360,"ms":5931,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — SD', lastSyncedAt: '2024-06-20T09:30:00Z' },\n { id: 'sav…" [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — ":"3274/30","raw":3071,"cached":3072,"ms":2283,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 3481/150","raw":12827,"cached":12288,"ms":4303,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — ":"8734/86","raw":8496,"cached":8320,"ms":2555,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — ":"9618/81","raw":8884,"cached":8320,"ms":2683,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — SD', lastSyncedAt: '2024-06-20T09:30:00Z' },\n { id: 'sav…" [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 7691/178","raw":16212,"cached":15360,"ms":5314,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — ":"3271/26","raw":3062,"cached":3072,"ms":2411,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 1269/163","raw":10027,"cached":10240,"ms":3742,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 7973/548","raw":20171,"cached":23296,"ms":9134,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 10/3364","raw":24459,"cached":16896,"ms":80646,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 14:59] upstream-error (gw) — SD', lastSyncedAt: '2024-06-20T09:30:00Z' },\n { id: 'sav…" [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 10s.","type":"rate_lim
- [2026-09-04 14:59] upstream-error (gw) — 11810/165","raw":11456,"cached":8320,"ms":4931,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 8s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — SD', lastSyncedAt: '2024-06-20T09:30:00Z' },\n { id: 'sav…" [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 7s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 7s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 4168/167","raw":20631,"cached":15488,"ms":7799,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 5s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — try again in 5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 4s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 90/1326","raw":18876,"cached":23552,"ms":17051,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 20/3615","raw":21137,"cached":26624,"ms":39688,"ttft":null} [upstream yolo] 502: {   "error": {     "message": "Network connection lost.",     "type": "server_error",     "param":
- [2026-09-04 14:59] upstream-error (gw) — 14195/69","raw":11143,"cached":13312,"ms":3146,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] upstream-error (gw) — 15910/93","raw":12895,"cached":13312,"ms":3408,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 14:59] failover (gw) — 82","raw":10128,"cached":8320,"ms":3495,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"{\n  \"error\": {\n    \"message\": \"Network co
- [2026-09-04 14:59] failover (gw) — ttempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"{\n  \"error\": {\n    \"message\": \"Network co
- [2026-09-04 14:59] tunnel-524-timeout (gw) — lash","why":"session-sticky-hop(yolo+feihoa-busy)","tok":"21524/564","raw":15550,"cached":20480,"ms":9160,"ttft":null} [prefix-lint] ccf19648-d4c0-400e-b82c-8ed78ceced06: volatile:
- [2026-09-04 14:59] stream/dispatch-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 14:59] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 14:59] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [upstream hyper] 429: {"error":{"message":"You've
- [2026-09-04 14:59] stream/dispatch-error (gw) — SD', lastSyncedAt: '2024-06-20T09:30:00Z' },\n { id: 'sav…" [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation t
- [2026-09-04 14:59] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 14:59] stream/dispatch-error (gw) — 8691/7663","raw":6632,"cached":8320,"ms":68852,"ttft":null} [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 14:59] stream/dispatch-error (gw) — 69/31882","raw":4063,"cached":4096,"ms":522894,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 14:59] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"

## check 2026-09-04 15:11 — turns=62 failovers=1 cache_hit=59% max_billed=24109
- [2026-09-04 15:11] failover (gw) — 3","raw":3086,"cached":1600,"ms":142555,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} {"ev":"tur
- [2026-09-04 15:11] stream/dispatch-error (gw) — [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation ti
- [2026-09-04 15:11] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation ti
- [2026-09-04 15:11] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying SyntaxError: JSON Parse error: Unexpected EOF  {"e
- [2026-09-04 15:11] stream/dispatch-error (gw) — ou', updatedAt: '2024-06-17T10:00:00Z', lines: 32, likes:…" [dispatch hyper] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"

## check 2026-09-04 15:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 15:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 15:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 15:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 16:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 16:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 16:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 16:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 16:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 17:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 17:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 17:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 17:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 17:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 18:11 — turns=36 failovers=2 cache_hit=70% max_billed=15059
- [2026-09-04 18:11] failover (gw) — /89","raw":5647,"cached":6720,"ms":3773,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"{\n  \"error\": {\n    \"message\": \"Upstream r
- [2026-09-04 18:11] failover (gw) — 16","raw":5601,"cached":5504,"ms":14710,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"{\n  \"error\": {\n    \"message\": \"Upstream r
- [2026-09-04 18:11] stream/dispatch-error (gw) — 14798/180","raw":6412,"cached":11264,"ms":4859,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7

## check 2026-09-04 18:23 — turns=374 failovers=3 cache_hit=67% max_billed=39781
- [2026-09-04 18:23] failover (gw) — ","raw":14495,"cached":31744,"ms":38003,"ttft":null} {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 18:23] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"feihoa","to":"yolo","status":429,"cause":"{\"error\":{\"message\":\"You're sending request
- [2026-09-04 18:23] tunnel-524-timeout (gw) — flash","why":"session-sticky-hop(yolo+feihoa-busy)","tok":"15249/8892","raw":14302,"cached":14976,"ms":107201,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":
- [2026-09-04 18:23] tunnel-524-timeout (gw) — on-sticky-hop(yolo+feihoa-busy)","tok":"16910/15054","raw":15242,"cached":15360,"ms":203755,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"Q
- [2026-09-04 18:23] tunnel-524-timeout (gw) — -busy)","tok":"21475/7159","raw":10793,"cached":10240,"ms":95243,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3.8-flash","tier":"flash
- [2026-09-04 18:23] tunnel-524-timeout (gw) — ","why":"session-sticky-hop(yolo+feihoa-busy)","tok":"32529/524","raw":15132,"cached":29696,"ms":13483,"ttft":null} [feihoa] 429 — short backoff 2000ms, then failover if still busy
- [2026-09-04 18:23] stream/dispatch-error (gw) — u're sending requests faster than this plan allows. Reduc"} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 18:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 18:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation t
- [2026-09-04 18:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 18:23] stream/dispatch-error (gw) — 4318/156","raw":20864,"cached":21504,"ms":6145,"ttft":null} [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 18:23] stream/dispatch-error (gw) — p string, e.g. \"2025-01-15T09:30:00.000Z\". */\nexport t…" [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71

## check 2026-09-04 18:35 — turns=306 failovers=3 cache_hit=73% max_billed=45442
- [2026-09-04 18:35] upstream-error (gw) — 327/557","raw":21151,"cached":23552,"ms":13815,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 18:35] upstream-error (gw) — in a few minutes.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 18:35] upstream-error (gw) — p string, e.g. \"2025-01-15T09:30:00.000Z\". */\nexport t…" [upstream feihoa] 429: {"error":{"message":"You're sending requests faster than this plan allows. Reduce the request rat
- [2026-09-04 18:35] failover (gw) — rate_limit_error","param":null,"code":"rate_limit"}} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} [dispatch
- [2026-09-04 18:35] failover (gw) — ttempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} {"ev":"tur
- [2026-09-04 18:35] failover (gw) — 7943","raw":5089,"cached":0,"ms":219793,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} [feihoa] 4
- [2026-09-04 18:35] tunnel-524-timeout (gw) — ,"why":"sticky-escalate(debugging)","tok":"7226/238","raw":6524,"cached":0,"ms":8895,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3.8-
- [2026-09-04 18:35] tunnel-524-timeout (gw) — ion-sticky-hop(yolo+feihoa-busy)","tok":"15573/160","raw":14524,"cached":7168,"ms":5039,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3
- [2026-09-04 18:35] tunnel-524-timeout (gw) — ssion-sticky-hop(yolo+feihoa-busy)","tok":"25904/89","raw":25249,"cached":20480,"ms":5169,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwe
- [2026-09-04 18:35] tunnel-524-timeout (gw) — why":"sticky-escalate(debugging)","tok":"36101/154","raw":35524,"cached":0,"ms":8214,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3.8-
- [2026-09-04 18:35] stream/dispatch-error (gw) — "status":502,"cause":"connection:The operation timed out."} [dispatch hyper] connection failure: The operation timed out. [dispatch hyper] connection failure: The operation timed o
- [2026-09-04 18:35] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch hyper] connection failure: The operation timed out. [feihoa] 429 — short backoff 2000ms, then failover if stil
- [2026-09-04 18:35] stream/dispatch-error (gw) — /13390","raw":22516,"cached":27648,"ms":113431,"ttft":null} [dispatch yolo] connection failure: The operation timed out. [prefix-lint] ccf19648-d4c0-400e-b82c-8ed78ceced06: volatil
- [2026-09-04 18:35] stream/dispatch-error (gw) — y)","tok":"97/53","raw":2,"cached":0,"ms":2354,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"
- [2026-09-04 18:35] stream/dispatch-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [dispatch yolo] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 18:35] stream/dispatch-error (gw) — p string, e.g. \"2025-01-15T09:30:00.000Z\". */\nexport t…" [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 18:35] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 18:35] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 18:35] stream/dispatch-error (gw) — y)","tok":"97/63","raw":2,"cached":0,"ms":3022,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 18:35] stream/dispatch-error (gw) — 3254/141","raw":30487,"cached":14976,"ms":8985,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 18:35] stream/dispatch-error (gw) — 42/1372","raw":43563,"cached":41984,"ms":24048,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation

## check 2026-09-04 18:47 — turns=205 failovers=0 cache_hit=76% max_billed=40495
- [2026-09-04 18:47] tunnel-524-timeout (gw) — lash","why":"session-sticky-hop(yolo+feihoa-busy)","tok":"11524/62","raw":10299,"cached":10240,"ms":3182,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen
- [2026-09-04 18:47] stream/dispatch-error (gw) — 7539/188","raw":15392,"cached":12288,"ms":5317,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 18:47] stream/dispatch-error (gw) — 99/2944","raw":20184,"cached":21504,"ms":41547,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 18:47] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 18:47] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 18:47] stream/dispatch-error (gw) — 054/541","raw":15545,"cached":17728,"ms":17334,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation t
- [2026-09-04 18:47] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 18:47] stream/dispatch-error (gw) — /10752","raw":20963,"cached":21504,"ms":144356,"ttft":null} [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 18:47] stream/dispatch-error (gw) — 15/1695","raw":17834,"cached":20480,"ms":21331,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"dispatch-degraded","from":"qwen3.8-max","t
- [2026-09-04 18:47] stream/dispatch-error (gw) — 95/3357","raw":39528,"cached":26624,"ms":53986,"ttft":null} [dispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out
- [2026-09-04 18:47] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 18:47] stream/dispatch-error (gw) — 64/17427","raw":4735,"cached":4096,"ms":155272,"ttft":null} [dispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out
- [2026-09-04 18:47] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operatio
- [2026-09-04 18:47] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out
- [2026-09-04 18:47] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operation timed out. [dispatch yolo] attempt 1 failed (The operation timed out.
- [2026-09-04 18:47] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operation
- [2026-09-04 18:47] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"
- [2026-09-04 18:47] stream/dispatch-error (gw) — /13627","raw":18525,"cached":21632,"ms":177419,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation t
- [2026-09-04 18:47] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation ti
- [2026-09-04 18:47] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operation
- [2026-09-04 18:47] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out
- [2026-09-04 18:47] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7

## check 2026-09-04 18:59 — turns=268 failovers=4 cache_hit=72% max_billed=63204
- [2026-09-04 18:59] upstream-error (gw) — 7723/139","raw":22898,"cached":19456,"ms":5741,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 18:59] failover (gw) — 297","raw":9692,"cached":8192,"ms":6043,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} {"ev":"tur
- [2026-09-04 18:59] failover (gw) — ttempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} {"ev":"bac
- [2026-09-04 18:59] failover (gw) — ":502,"cause":"connection:The operation timed out."} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} [feihoa] 4
- [2026-09-04 18:59] failover (gw) — ","raw":16575,"cached":16064,"ms":80474,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"{\n  \"error\": {\n    \"message\": \"Network co
- [2026-09-04 18:59] tunnel-524-timeout (gw) — hoa-busy)","tok":"41564/87","raw":27610,"cached":38272,"ms":5240,"ttft":null} [prefix-lint] ccf19648-d4c0-400e-b82c-8ed78ceced06: volatile:iso-timestamp in tool[23]: "…";\n\nconst
- [2026-09-04 18:59] tunnel-524-timeout (gw) — sion-sticky-hop(yolo+feihoa-busy)","tok":"15977/132","raw":15248,"cached":11648,"ms":7588,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwe
- [2026-09-04 18:59] tunnel-524-timeout (gw) — ion-sticky-hop(yolo+feihoa-busy)","tok":"21789/193","raw":20524,"cached":15360,"ms":5399,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen
- [2026-09-04 18:59] stream/dispatch-error (gw) — s\nconst NOW = \"2025-06-01T09:00:00.000Z\";\nlet idCount…" [dispatch hyper] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"
- [2026-09-04 18:59] stream/dispatch-error (gw) — 9: const NOW = \"2025-06-01T09:00:00.000Z\";\n20: \n21: l…" [dispatch hyper] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"
- [2026-09-04 18:59] stream/dispatch-error (gw) — :"10768/1056","raw":9733,"cached":0,"ms":26857,"ttft":null} [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"f
- [2026-09-04 18:59] stream/dispatch-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [dispatch yolo] connection failure: The operation timed out. [dispatch yolo] connection failure: The operation timed out
- [2026-09-04 18:59] stream/dispatch-error (gw) — dispatch yolo] connection failure: The operation timed out. [dispatch yolo] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q

## check 2026-09-04 19:11 — turns=59 failovers=2 cache_hit=69% max_billed=34534
- [2026-09-04 19:11] upstream-error (gw) — 64/1337","raw":20956,"cached":19456,"ms":20832,"ttft":null} [upstream hyper] 429: {"error":{"message":"Please try again in a few minutes.","type":"rate_limit_error","code":null}}
- [2026-09-04 19:11] upstream-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m27s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m27s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m27s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m27s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m28s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m28s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m24s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m23s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m23s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m24s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m19s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m19s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m17s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m17s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m12s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m12s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m12s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m12s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m10s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m10s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m10s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m10s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m5s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 2m5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m5s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 2m5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m49s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m49s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m48s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m48s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m46s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m46s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m45s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m45s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m42s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m42s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m41s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m27s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m27s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m27s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — 2082/163","raw":29153,"cached":896,"ms":246836,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m1s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 59s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 59s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 55s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 55s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 54s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 54s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 53s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 53s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 48s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 27s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 27s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m13s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 2m13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m10s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — ry again in 2m5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m0s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 2m0s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m54s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m54s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m51s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m51s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m49s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m49s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m49s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m48s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m47s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m47s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m47s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m47s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m46s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m46s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m47s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m47s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m45s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m45s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m45s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m45s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m44s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m44s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m43s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m43s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m43s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m43s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m42s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m42s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m42s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m42s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m43s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m43s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m41s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m41s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m40s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m40s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m42s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m42s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m39s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m39s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m38s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m38s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m38s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m38s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m37s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m37s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m39s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m39s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m36s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m36s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m35s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m35s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m37s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m37s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m35s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m35s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m33s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m33s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m32s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m32s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m32s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m32s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m31s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m31s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m30s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m30s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m30s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m30s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m29s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m29s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m30s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m29s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m28s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m28s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m28s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m28s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m27s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m27s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m26s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m26s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m25s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m25s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m25s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m25s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m24s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m24s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m23s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m23s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m23s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m23s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m22s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m22s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m22s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m22s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m21s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m21s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m20s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m20s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m20s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m20s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m19s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m19s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m19s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m19s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m18s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m18s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m18s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m18s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m17s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m17s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m16s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m16s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m15s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m15s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m15s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m15s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m14s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — 37/22861","raw":5243,"cached":5120,"ms":537673,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m14s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m14s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m14s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m14s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m13s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m13s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m12s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m12s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m12s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m12s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m11s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m11s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m10s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m10s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m10s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m10s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m9s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m9s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m8s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m8s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m7s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m7s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m6s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m6s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m5s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m5s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m4s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m4s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m4s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m4s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m3s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m3s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ispatch hyper] connection failure: The operation timed out. [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m2s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m2s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m1s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m1s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m2s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m0s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m0s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 59s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 59s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 59s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 59s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 58s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 58s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 58s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 58s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 57s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 57s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 57s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 57s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 55s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 55s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 55s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 54s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 54s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 53s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 53s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 53s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 52s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 52s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 51s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 51s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 51s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 51s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 52s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 52s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 49s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 49s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 49s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 49s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 48s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 48s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 48s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 48s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 46s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 46s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 46s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 46s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 45s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 45s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 44s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 44s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 44s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 44s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 41s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 41s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 34s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 34s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 34s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 34s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 32s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 32s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 31s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 31s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 31s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 31s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 30s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 30s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 27s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 27s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 26s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 26s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 25s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 25s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 16s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 16s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 16s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 16s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 15s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 15s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 15s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 15s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 14s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 14s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 14s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 14s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 13s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 13s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 13s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 12s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 12s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 12s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 12s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 11s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 11s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 10s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 10s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 11s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 10s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 10s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 11s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 9s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 9s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 8s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 8s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 8s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 7s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 7s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 6s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 6s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 6s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 6s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 7s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 7s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 5s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 5s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 4s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 4s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 4s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 4s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — "status":502,"cause":"connection:The operation timed out."} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m0s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 2m0s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2m0s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 2m0s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m59s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m59s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m59s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m59s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m57s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m57s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m57s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m57s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m56s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m56s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m56s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m56s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m55s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m55s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m55s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m55s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m54s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m54s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m54s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m54s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m53s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m53s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m52s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m52s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m52s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m52s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m51s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m51s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m51s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m51s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m50s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m50s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m48s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m48s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m48s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m48s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m45s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m41s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m41s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m41s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m39s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m39s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m40s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m40s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m38s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m37s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m36s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m36s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m36s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m35s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m35s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m35s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m36s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m35s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m34s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m34s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m34s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m34s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m32s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m31s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m30s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m32s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m32s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m29s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — 695/68","raw":20020,"cached":23552,"ms":250227,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m29s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m29s.","type":"rate_limit_error","code":null}}  [upstream yolo] 502: {   "error": {     "message": "Network connection lost.",     "type": "server_error",     "param":
- [2026-09-04 19:11] upstream-error (gw) — 1963/217","raw":10839,"cached":8256,"ms":21434,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 51s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 51s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 49s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 48s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 47s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 47s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 46s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 44s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 43s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — "7375/220","raw":6859,"cached":6592,"ms":27108,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 42s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 42s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 42s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 42s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 41s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 41s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 41s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 41s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 40s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 40s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 39s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 39s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 39s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — "7390/153","raw":6875,"cached":6592,"ms":25321,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 37s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 37s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 37s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 37s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 36s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 36s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 36s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 36s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 35s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 35s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 34s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 34s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 33s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 33s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 32s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 32s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 32s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 30s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 30s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 30s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 29s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 29s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 29s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 29s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 25s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 25s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 25s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 25s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 24s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 24s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 22s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 22s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 22s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 22s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 21s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 21s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 21s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — ":"3776/29","raw":3427,"cached":896,"ms":32425,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 18s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 18s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 18s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — :"3782/27","raw":3424,"cached":3776,"ms":24831,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 17s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 17s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 17s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 17s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 16s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — ":"3975/27","raw":3668,"cached":896,"ms":22123,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 15s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 15s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 12s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — k":"9064/81","raw":8783,"cached":896,"ms":8329,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 10s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — k":"4631/27","raw":4235,"cached":896,"ms":9242,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 7s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 3s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 3s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — ":"4628/27","raw":4242,"cached":896,"ms":17763,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m11s.","type":"rate_l
- [2026-09-04 19:11] upstream-error (gw) — y again in 1m10s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m6s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — ry again in 1m6s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1m0s.","type":"rate_li
- [2026-09-04 19:11] upstream-error (gw) — "9071/124","raw":8791,"cached":3968,"ms":30127,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 58s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 58s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 56s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 56s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 53s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 49s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 46s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — :"8218/96","raw":7868,"cached":4608,"ms":45126,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 36s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 36s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 34s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — :"8215/88","raw":7875,"cached":4608,"ms":38289,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 33s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 33s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 34s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — :"3783/29","raw":3435,"cached":3776,"ms":25697,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 31s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 29s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 28s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — "7373/200","raw":6867,"cached":6592,"ms":13994,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 25s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 25s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 23s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 23s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 22s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 21s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 19s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 19s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 17s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 16s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 14s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 14s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 9s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 19:11] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 52s.","type":"rate_lim
- [2026-09-04 19:11] upstream-error (gw) — try again in 52s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 52s.","type":"rate_lim
- [2026-09-04 19:11] failover (gw) — ain in 3s.","type":"rate_limit_error","code":null}}  {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} [upstream
- [2026-09-04 19:11] failover (gw) — in 1m32s.","type":"rate_limit_error","code":null}}  {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"{\n  \"error\": {\n    \"message\": \"Network co
- [2026-09-04 19:11] tunnel-524-timeout (gw) — sion-sticky-hop(yolo+feihoa-busy)","tok":"5537/22861","raw":5243,"cached":5120,"ms":537673,"ttft":null} [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit
- [2026-09-04 19:11] stream/dispatch-error (gw) — 45/1704","raw":16702,"cached":16384,"ms":19474,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 19:11] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 19:11] stream/dispatch-error (gw) — 05/2035","raw":23006,"cached":27648,"ms":21689,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 19:11] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 19:11] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation t
- [2026-09-04 19:11] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation t
- [2026-09-04 19:11] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [upstream hyper] 429: {"error":{"message":"You've
- [2026-09-04 19:11] stream/dispatch-error (gw) — y again in 1m41s.","type":"rate_limit_error","code":null}}  [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 19:11] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [upstream hyper] 429: {"error":{"message":"You've
- [2026-09-04 19:11] stream/dispatch-error (gw) — try again in 48s.","type":"rate_limit_error","code":null}}  [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation t
- [2026-09-04 19:11] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [upstream hyper] 429: {"error":{"message":"You've
- [2026-09-04 19:11] stream/dispatch-error (gw) — ry again in 1m3s.","type":"rate_limit_error","code":null}}  [dispatch hyper] connection failure: The operation timed out. [upstream hyper] 429: {"error":{"message":"You've hit your

## check 2026-09-04 19:23 — turns=37 failovers=2 cache_hit=63% max_billed=20398
- [2026-09-04 19:23] upstream-error (gw) — [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 47s.","type":"rate_lim
- [2026-09-04 19:23] upstream-error (gw) — try again in 47s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 47s.","type":"rate_lim
- [2026-09-04 19:23] upstream-error (gw) — try again in 47s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 32s.","type":"rate_lim
- [2026-09-04 19:23] upstream-error (gw) — try again in 32s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 29s.","type":"rate_lim
- [2026-09-04 19:23] upstream-error (gw) — try again in 29s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 24s.","type":"rate_lim
- [2026-09-04 19:23] upstream-error (gw) — try again in 24s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 4s.","type":"rate_limi
- [2026-09-04 19:23] upstream-error (gw) — try again in 4s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 2s.","type":"rate_limi
- [2026-09-04 19:23] upstream-error (gw) — try again in 2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 21s.","type":"rate_lim
- [2026-09-04 19:23] upstream-error (gw) — try again in 21s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 12s.","type":"rate_lim
- [2026-09-04 19:23] upstream-error (gw) — try again in 12s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 9s.","type":"rate_limi
- [2026-09-04 19:23] upstream-error (gw) — try again in 9s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 5s.","type":"rate_limi
- [2026-09-04 19:23] upstream-error (gw) — try again in 5s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 4s.","type":"rate_limi
- [2026-09-04 19:23] upstream-error (gw) — try again in 2s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 19:23] upstream-error (gw) — try again in 1s.","type":"rate_limit_error","code":null}}  [upstream hyper] 429: {"error":{"message":"You've hit your hourly rate limit. Please try again in 1s.","type":"rate_limi
- [2026-09-04 19:23] failover (gw) — ttempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} {"ev":"bac
- [2026-09-04 19:23] failover (gw) — ":502,"cause":"connection:The operation timed out."} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} [feihoa] 4
- [2026-09-04 19:23] stream/dispatch-error (gw) — ":"8756/1268","raw":8182,"cached":0,"ms":35510,"ttft":null} [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation ti
- [2026-09-04 19:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation ti
- [2026-09-04 19:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 19:23] stream/dispatch-error (gw) — 98/1012","raw":18120,"cached":15360,"ms":20335,"ttft":null} [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"f
- [2026-09-04 19:23] stream/dispatch-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [dispatch yolo] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q

## check 2026-09-04 19:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 19:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- [2026-09-04 19:47] stream/dispatch-error (gw) — [dispatch yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation ti
- [2026-09-04 19:47] stream/dispatch-error (gw) — yolo] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] attempt 1 failed (The operation timed out.), retrying

## check 2026-09-04 19:59 — turns=3 failovers=3 cache_hit=0% max_billed=90
- [2026-09-04 19:59] failover (gw) — {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} {"ev":"tur
- [2026-09-04 19:59] failover (gw) — ttempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} {"ev":"tur
- [2026-09-04 19:59] failover (gw) — :"90/32","raw":3,"cached":0,"ms":599430,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} {"ev":"tur
- [2026-09-04 19:59] stream/dispatch-error (gw) — ","tok":"90/34","raw":3,"cached":0,"ms":607821,"ttft":null} [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"f

## check 2026-09-04 20:11 — turns=1 failovers=1 cache_hit=0% max_billed=66
- [2026-09-04 20:11] failover (gw) — ttempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:The operation timed out."} {"ev":"tur
- [2026-09-04 20:11] stream/dispatch-error (gw) — [dispatch yolo] attempt 1 failed (The operation timed out.), retrying {"ev":"backchannel-failover","from":"yolo","to":"f

## check 2026-09-04 20:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 20:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 20:47 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 20:59 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 21:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 21:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 21:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 21:47 — turns=0 failovers=0 cache_hit=0% max_billed=81
- no new issues

## check 2026-09-04 21:59 — turns=1 failovers=1 cache_hit=0% max_billed=81
- [2026-09-04 21:59] failover (gw) — ttempt 1 failed (backchannel ttft ceiling), retrying {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"tur
- [2026-09-04 21:59] stream/dispatch-error (gw) — [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"backchannel-failover","from":"yolo","to":"f

## check 2026-09-04 22:11 — turns=1 failovers=0 cache_hit=0% max_billed=102
- no new issues

## 2026-09-04 (routing redesign verified live, commit 281e158)

### Root causes found today
1. **Yolo slot leak** — stream loops (chat.ts/messages.ts) had no finally; error/abort
   paths never cancelled the reader → 841 turns dumped onto paid qwen3.8-flash.
2. **Yolo silent wedge = pressure exhaustion** (Terms §7): at 78-82% of the 14M/24h
   Builder window yolo hangs /chat/completions with NO 429/headers. Wedge windows:
   02:00 (6.3M rolling-24h) and 18:00 (11.4M rolling-24h = 82%).
3. **Hyper COGS understated ~33%** — qwen3.8-max real rates in $2.833/out $7.333
   per M (reverse-engineered from cost.usd on 4 live calls). Ledger $15.42 vs
   real ~$19.19 all-time. Fixed in pricing.ts.
4. **Agnes paid key dead** — 402 subscription_not_found on apihub.agnes-ai.com/v1.
   Dead-lane cooldown auto-skips it for 30min after first 401/402.

### New systems live (all verified end-to-end through the tunnel)
- **Yolo pressure tracker**: ring buffer, ledger-seeded at boot (10.95M/24h on
  restart = softDeny correctly true). Gate: soft 60%, hard 75% of 3M/1h & 14M/24h.
- **Hyper $12.5/day budget gate**: ledger spend + in-flight reservations;
  budget-out → same-model llmgateway hop. Confirmed: "hardness=routine,
  full-share 10.0% → hyper-budget-out" then glm-5.3-flash served by llmgateway.
- **LLGateway fallback lane** (api.llmgateway.io): qwen3.8-max/27b/flash,
  glm-5.3/flash, OpenAI + Anthropic endpoints, NO upstream caching → fallback only.
- **Theta chain**: agnes→stepfun→yolo→hyper-flash→llmgateway (agnes 401 →
  markDead → stepfun served in 8s; second theta direct-stepfun 4.3s).
- **25s TTFT ceiling** on backchannel first attempts — yolo wedge failover now
  fires in ~25s instead of 60s+.

### Watch next run
- Yolo 24h window drains over time; when below 60% (8.4M) tracker re-admits yolo.
- Hyper budget resets at local midnight — llmgateway carries the tail today.
- llmgateway latency: 27b ~13s (measured) vs yolo 29.6 TPS — yolo stays primary
  when pressure allows.

## check 2026-09-04 22:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 22:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-04 22:47 — turns=18 failovers=0 cache_hit=0% max_billed=328
- no new issues

## check 2026-09-04 22:59 — turns=78 failovers=1 cache_hit=37% max_billed=11725
- [2026-09-04 22:59] upstream-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"t
- [2026-09-04 22:59] upstream-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatc
- [2026-09-04 22:59] failover (gw) — tepfun] connection failure: backchannel ttft ceiling {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"llm
- [2026-09-04 22:59] tunnel-524-timeout (gw) — why":"session-sticky","tok":"58/35","raw":1,"cached":0,"ms":5241,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qwen3.8-27b","tier":"flash",
- [2026-09-04 22:59] stream/dispatch-error (gw) — :"4818/129","raw":4533,"cached":4224,"ms":4539,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 22:59] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ce
- [2026-09-04 22:59] stream/dispatch-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchanne
- [2026-09-04 22:59] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 22:59] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep"
- [2026-09-04 22:59] stream/dispatch-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel t
- [2026-09-04 22:59] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel t
- [2026-09-04 22:59] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"stepfun","t
- [2026-09-04 22:59] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling {"ev":"backchannel-failover","from":"yolo","to":"feihoa"
- [2026-09-04 22:59] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling {"ev":"theta-failover","from":"stepfun","status":429,"ca
- [2026-09-04 22:59] stream/dispatch-error (gw) — ok":"3647/185","raw":3478,"cached":0,"ms":4655,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","status
- [2026-09-04 22:59] stream/dispatch-error (gw) — ":"3545/91","raw":3426,"cached":3200,"ms":3822,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","status
- [2026-09-04 22:59] stream/dispatch-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","sta

## check 2026-09-04 23:11 — turns=17 failovers=0 cache_hit=80% max_billed=17043
- [2026-09-04 23:11] upstream-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:11] upstream-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:11] upstream-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatc
- [2026-09-04 23:11] stream/dispatch-error (gw) — 1262/631","raw":9689,"cached":10496,"ms":18931,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchanne
- [2026-09-04 23:11] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":"co
- [2026-09-04 23:11] stream/dispatch-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71

## 2026-09-04 (theta 429 fix, commit 6d899a5)

**38 upstream-429s on theta = StepFun concurrency exhaustion.**
- Server limit is 8 concurrent (error body: "concurrency reached, current: 9,
  limit: 8"). Theta bursts run 20-54 turns/min at ~10-19s/req → 8 slots
  saturated → our failover retry burst pushed server to 9 → 429 loop.
- 317 stepfun 429s vs 259 served = 122% request waste pre-fix.
- Fixes: mirror 6/8 slots, non-2xx instant slot release, 20s 429 lane cooldown.
- 12-way burst verified post-fix: 0 failed turns; overflow absorbed by
  llmgateway glm-5.3-flash (9 turns @ 1.2-3.5s) + 3 stepfun turns.

## check 2026-09-04 23:23 — turns=168 failovers=28 cache_hit=62% max_billed=29125
- [2026-09-04 23:23] upstream-error (gw) — 4/1889","raw":12158,"cached":14976,"ms":618797,"ttft":null} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatc
- [2026-09-04 23:23] upstream-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"l
- [2026-09-04 23:23] upstream-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatc
- [2026-09-04 23:23] upstream-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"t
- [2026-09-04 23:23] failover (gw) — 6","raw":9075,"cached":10368,"ms":12476,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [dispatch
- [2026-09-04 23:23] failover (gw) — 6","raw":9359,"cached":16896,"ms":66417,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — -27b","cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — ttempt 1 failed (backchannel ttft ceiling), retrying {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — h yolo] connection failure: backchannel ttft ceiling {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — ","raw":9848,"cached":10496,"ms":121690,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — ,"raw":10432,"cached":12672,"ms":135904,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — 4","raw":9438,"cached":21504,"ms":12422,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — 170","raw":9014,"cached":8320,"ms":4844,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — ","raw":12175,"cached":13312,"ms":13678,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — -27b","cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"tur
- [2026-09-04 23:23] failover (gw) — 6","raw":9302,"cached":24576,"ms":21220,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"llm
- [2026-09-04 23:23] failover (gw) — ,"raw":12905,"cached":12672,"ms":242959,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — ttempt 1 failed (backchannel ttft ceiling), retrying {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"bac
- [2026-09-04 23:23] failover (gw) — ":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — ","raw":12265,"cached":18432,"ms":38177,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — 7","raw":9328,"cached":24960,"ms":15964,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [dispatch
- [2026-09-04 23:23] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — ","raw":12699,"cached":15360,"ms":13999,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:23] failover (gw) — 6","raw":12755,"cached":16384,"ms":3538,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"bac
- [2026-09-04 23:23] failover (gw) — ":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"bac
- [2026-09-04 23:23] tunnel-524-timeout (gw) — on-sticky-hop(yolo+feihoa-busy)","tok":"16325/3995","raw":12524,"cached":15360,"ms":49964,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"
- [2026-09-04 23:23] tunnel-524-timeout (gw) — flash","why":"session-sticky-hop(yolo+feihoa-busy)","tok":"25245/9234","raw":10491,"cached":23552,"ms":109882,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":
- [2026-09-04 23:23] tunnel-524-timeout (gw) — ":"theta-hard=stepfun","tok":"6544/129","raw":5847,"cached":5248,"ms":4290,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"theta","to":"step-3.7-flash","tier
- [2026-09-04 23:23] tunnel-524-timeout (gw) — ":"theta-hard=stepfun","tok":"7443/124","raw":6749,"cached":5248,"ms":4732,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"theta","to":"step-3.7-flash","tier
- [2026-09-04 23:23] tunnel-524-timeout (gw) — ":"theta-hard=stepfun","tok":"6925/162","raw":6163,"cached":5248,"ms":4760,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"theta","to":"glm-5.3-flash","tier"
- [2026-09-04 23:23] tunnel-524-timeout (gw) — :"theta-hard=stepfun","tok":"6765/1137","raw":6038,"cached":5248,"ms":19991,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"theta","to":"step-3.7-flash","tie
- [2026-09-04 23:23] tunnel-524-timeout (gw) — ":"theta-hard=stepfun","tok":"6350/195","raw":5711,"cached":5248,"ms":4790,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"theta","to":"glm-5.3-flash","tier"
- [2026-09-04 23:23] tunnel-524-timeout (gw) — gateway-flash","tok":"6501/144","raw":6255,"cached":0,"ms":15242,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"theta","to":"step-3.7-flash","tier":"flash",
- [2026-09-04 23:23] stream/dispatch-error (gw) — ok":"13656/87","raw":8870,"cached":0,"ms":5347,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:23] stream/dispatch-error (gw) — "status":502,"cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [feihoa] 429 — short backoff 2000ms, then failo
- [2026-09-04 23:23] stream/dispatch-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel t
- [2026-09-04 23:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"yolo","to":
- [2026-09-04 23:23] stream/dispatch-error (gw) — "12080/30","raw":10371,"cached":4480,"ms":4970,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"backchannel-failover","from":"yolo","to":"f
- [2026-09-04 23:23] stream/dispatch-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"llmgateway-failover","from":"yolo","to":"qwen3.8-27b
- [2026-09-04 23:23] stream/dispatch-error (gw) — :"11910/262","raw":10293,"cached":0,"ms":17733,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel tt
- [2026-09-04 23:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"t
- [2026-09-04 23:23] stream/dispatch-error (gw) — 13965/342","raw":9133,"cached":4480,"ms":20728,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel tt
- [2026-09-04 23:23] stream/dispatch-error (gw) — 6007/451","raw":9560,"cached":13312,"ms":10373,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"backchannel-failover","from":"yolo","
- [2026-09-04 23:23] stream/dispatch-error (gw) — qwen3.8-27b","cause":"connection:backchannel ttft ceiling"} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel tt
- [2026-09-04 23:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"backchannel-failover","from":"yolo","to":"feihoa","s
- [2026-09-04 23:23] stream/dispatch-error (gw) — 4/4980","raw":12088,"cached":14720,"ms":126351,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:23] stream/dispatch-error (gw) — 5491/158","raw":12106,"cached":14336,"ms":4027,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:23] stream/dispatch-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"yolo","to":"qw
- [2026-09-04 23:23] stream/dispatch-error (gw) — qwen3.8-27b","cause":"connection:backchannel ttft ceiling"} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:23] stream/dispatch-error (gw) — :"19881/1221","raw":9130,"cached":0,"ms":77909,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:23] stream/dispatch-error (gw) — 21581/415","raw":9426,"cached":19968,"ms":6479,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel t
- [2026-09-04 23:23] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"backchannel-failover","from":"yolo","to":"f
- [2026-09-04 23:23] stream/dispatch-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 23:23] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep"
- [2026-09-04 23:23] stream/dispatch-error (gw) — 22/1093","raw":12435,"cached":15360,"ms":14615,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling)
- [2026-09-04 23:23] stream/dispatch-error (gw) — dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:23] stream/dispatch-error (gw) — 11750/437","raw":9048,"cached":11264,"ms":8992,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel tt
- [2026-09-04 23:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling)
- [2026-09-04 23:23] stream/dispatch-error (gw) — 24819/648","raw":9248,"cached":22528,"ms":8394,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 23:23] stream/dispatch-error (gw) — 12500/380","raw":9209,"cached":11648,"ms":8041,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel
- [2026-09-04 23:23] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling)
- [2026-09-04 23:23] stream/dispatch-error (gw) — 140/3044","raw":9278,"cached":12288,"ms":46133,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"yolo","to":"qw
- [2026-09-04 23:23] stream/dispatch-error (gw) — qwen3.8-27b","cause":"connection:backchannel ttft ceiling"} [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 23:23] stream/dispatch-error (gw) — 19/2752","raw":12221,"cached":18432,"ms":27254,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:23] stream/dispatch-error (gw) — "tok":"0/0","raw":11156,"cached":0,"ms":212666,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling)
- [2026-09-04 23:23] stream/dispatch-error (gw) — dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel tt
- [2026-09-04 23:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 23:23] stream/dispatch-error (gw) — 994/1672","raw":9321,"cached":15360,"ms":22278,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"backchannel-failover","from":"yolo","to":"f
- [2026-09-04 23:23] stream/dispatch-error (gw) — qwen3.8-27b","cause":"connection:backchannel ttft ceiling"} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 23:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 23:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] connection failure: backchannel t
- [2026-09-04 23:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling)
- [2026-09-04 23:23] stream/dispatch-error (gw) — dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:23] stream/dispatch-error (gw) — :"16919/284","raw":13140,"cached":0,"ms":63813,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 23:23] stream/dispatch-error (gw) — 25/3995","raw":12524,"cached":15360,"ms":49964,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:23] stream/dispatch-error (gw) — "status":502,"cause":"connection:backchannel ttft ceiling"} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:23] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [feihoa] 429 — short backoff 2000ms, then failover
- [2026-09-04 23:23] stream/dispatch-error (gw) — qwen3.8-27b","cause":"connection:backchannel ttft ceiling"} [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"llmgateway-failover","from":"yolo","to":"qwen3.8-27b
- [2026-09-04 23:23] stream/dispatch-error (gw) — qwen3.8-27b","cause":"connection:backchannel ttft ceiling"} [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] connection failure: backchannel ttft ceilin
- [2026-09-04 23:23] stream/dispatch-error (gw) — dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 23:23] stream/dispatch-error (gw) — 48/3846","raw":13213,"cached":14976,"ms":62330,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] connection failure: backchannel ttft ceilin
- [2026-09-04 23:23] stream/dispatch-error (gw) — dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] connection failure: backchannel ttft ceilin
- [2026-09-04 23:23] stream/dispatch-error (gw) — ok":"7979/335","raw":7017,"cached":0,"ms":9910,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:23] stream/dispatch-error (gw) — :"9082/345","raw":7825,"cached":8832,"ms":7077,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","status
- [2026-09-04 23:23] stream/dispatch-error (gw) — "9252/890","raw":8184,"cached":7936,"ms":18102,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:23] stream/dispatch-error (gw) — k":"9945/142","raw":9300,"cached":0,"ms":14153,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:23] stream/dispatch-error (gw) — ok":"8748/76","raw":8369,"cached":0,"ms":45654,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:23] stream/dispatch-error (gw) — ok":"8533/77","raw":7892,"cached":0,"ms":10479,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:23] stream/dispatch-error (gw) — ":"9486/62","raw":9043,"cached":4480,"ms":4774,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:23] stream/dispatch-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:23] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel ttft
- [2026-09-04 23:23] stream/dispatch-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:23] stream/dispatch-error (gw) — 3449/100","raw":12634,"cached":4480,"ms":10118,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch hyper] attempt 1 failed (The operation time
- [2026-09-04 23:23] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch stepfun] attempt 1 failed (backchannel
- [2026-09-04 23:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:23] stream/dispatch-error (gw) — 4405/138","raw":13503,"cached":8960,"ms":11733,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel t
- [2026-09-04 23:23] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:23] stream/dispatch-error (gw) — /10289","raw":13490,"cached":16896,"ms":556211,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:23] stream/dispatch-error (gw) — ":"12721/425","raw":10518,"cached":0,"ms":9922,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:23] stream/dispatch-error (gw) — 3374/119","raw":10959,"cached":12416,"ms":5741,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:23] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:23] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:23] stream/dispatch-error (gw) — k":"9293/520","raw":8922,"cached":0,"ms":49208,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:23] stream/dispatch-error (gw) — :"10106/1163","raw":8788,"cached":0,"ms":22185,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft
- [2026-09-04 23:23] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backc
- [2026-09-04 23:23] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft
- [2026-09-04 23:23] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"theta-failover","from":"stepfun","status":429,
- [2026-09-04 23:23] stream/dispatch-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft
- [2026-09-04 23:23] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","status
- [2026-09-04 23:23] stream/dispatch-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 23:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch stepfun] attempt 1 failed (backchannel
- [2026-09-04 23:23] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"stepfun","t
- [2026-09-04 23:23] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ce
- [2026-09-04 23:23] stream/dispatch-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backcha
- [2026-09-04 23:23] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"stepfun"
- [2026-09-04 23:23] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling {"ev":"dispatch-degraded","from":"qwen3.8-max","to":"qwe
- [2026-09-04 23:23] stream/dispatch-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:23] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":
- [2026-09-04 23:23] stream/dispatch-error (gw) — 3768/366","raw":11243,"cached":13440,"ms":9668,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"stepfun"
- [2026-09-04 23:23] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel tt
- [2026-09-04 23:23] stream/dispatch-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:23] stream/dispatch-error (gw) — 04/1201","raw":14023,"cached":16128,"ms":23974,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:23] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft
- [2026-09-04 23:23] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchanne
- [2026-09-04 23:23] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backc
- [2026-09-04 23:23] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling [upstream stepfun] 429: {"error":{"message":"concurre
- [2026-09-04 23:23] stream/dispatch-error (gw) — 809/975","raw":13990,"cached":16512,"ms":45251,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:23] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"stepfun"
- [2026-09-04 23:23] stream/dispatch-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backc
- [2026-09-04 23:23] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:23] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:23] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","status
- [2026-09-04 23:23] stream/dispatch-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:23] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:23] stream/dispatch-error (gw) — 15580/97","raw":14027,"cached":15488,"ms":6281,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":
- [2026-09-04 23:23] stream/dispatch-error (gw) — ":"15993/39","raw":14745,"cached":0,"ms":31745,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"dispatch-degraded","from":"qwen3.8-ma
- [2026-09-04 23:23] stream/dispatch-error (gw) — 158/9663","raw":9764,"cached":9984,"ms":736085,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:23] stream/dispatch-error (gw) — :"10709/357","raw":10219,"cached":0,"ms":39263,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchanne
- [2026-09-04 23:23] stream/dispatch-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","status
- [2026-09-04 23:23] stream/dispatch-error (gw) — ,"tok":"0/0","raw":3835,"cached":0,"ms":529911,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","status

## check 2026-09-04 23:35 — turns=340 failovers=20 cache_hit=73% max_billed=36571
- [2026-09-04 23:35] upstream-error (gw) — 11156/45","raw":10477,"cached":10304,"ms":5591,"ttft":null} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"t
- [2026-09-04 23:35] upstream-error (gw) — 74/18599","raw":3909,"cached":4096,"ms":511558,"ttft":null} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatc
- [2026-09-04 23:35] upstream-error (gw) — ":"9492/37","raw":9018,"cached":9024,"ms":5256,"ttft":null} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:35] upstream-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatc
- [2026-09-04 23:35] upstream-error (gw) — 10031/533","raw":8387,"cached":9088,"ms":43900,"ttft":null} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"l
- [2026-09-04 23:35] failover (gw) — ","raw":16849,"cached":17408,"ms":12677,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"bac
- [2026-09-04 23:35] failover (gw) — ":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"tur
- [2026-09-04 23:35] failover (gw) — 1","raw":22529,"cached":33792,"ms":9600,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:35] failover (gw) — ","raw":16782,"cached":17408,"ms":18690,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:35] failover (gw) — 0","raw":23993,"cached":35840,"ms":8010,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"bac
- [2026-09-04 23:35] failover (gw) — ":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:35] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:35] failover (gw) — -27b","cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:35] failover (gw) — 5","raw":11578,"cached":11648,"ms":7299,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"bac
- [2026-09-04 23:35] failover (gw) — 22/65","raw":13221,"cached":0,"ms":4306,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"tur
- [2026-09-04 23:35] failover (gw) — ","raw":19168,"cached":19456,"ms":10186,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"bac
- [2026-09-04 23:35] failover (gw) — 7","raw":18208,"cached":21632,"ms":9161,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:35] failover (gw) — 8","raw":14113,"cached":15360,"ms":3823,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:35] failover (gw) — -27b","cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"tur
- [2026-09-04 23:35] failover (gw) — 516/21","raw":3658,"cached":0,"ms":4655,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"tur
- [2026-09-04 23:35] failover (gw) — 63/106","raw":6786,"cached":0,"ms":3818,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:35] tunnel-524-timeout (gw) — ":"theta-hard=stepfun","tok":"6665/123","raw":5972,"cached":5248,"ms":4054,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"theta","to":"step-3.7-flash","tier
- [2026-09-04 23:35] stream/dispatch-error (gw) — 6530/71","raw":15236,"cached":15936,"ms":33348,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:35] stream/dispatch-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:35] stream/dispatch-error (gw) — tok":"3546/41","raw":3423,"cached":0,"ms":4186,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:35] stream/dispatch-error (gw) — k":"18523/90","raw":15493,"cached":0,"ms":6507,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backcha
- [2026-09-04 23:35] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:35] stream/dispatch-error (gw) — "6512/375","raw":5832,"cached":5376,"ms":16812,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft
- [2026-09-04 23:35] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","status
- [2026-09-04 23:35] stream/dispatch-error (gw) — "8811/545","raw":7886,"cached":6144,"ms":11504,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"llmgateway-failover","from":"stepfun","to":"st
- [2026-09-04 23:35] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep"
- [2026-09-04 23:35] stream/dispatch-error (gw) — 10688/829","raw":9250,"cached":8448,"ms":20081,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:35] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:35] stream/dispatch-error (gw) — :"7737/244","raw":6814,"cached":6400,"ms":4911,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:35] stream/dispatch-error (gw) — ok":"8469/277","raw":7347,"cached":0,"ms":7441,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft
- [2026-09-04 23:35] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backc
- [2026-09-04 23:35] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:35] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"theta-failover","from":"stepfun","status":429,
- [2026-09-04 23:35] stream/dispatch-error (gw) — 14331/28","raw":13520,"cached":13312,"ms":5134,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:35] stream/dispatch-error (gw) — 11912/276","raw":12179,"cached":8448,"ms":9897,"ttft":null} [dispatch hyper] connection failure: The operation timed out. [dispatch llmgateway] attempt 1 failed (backchannel ttft c
- [2026-09-04 23:35] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:35] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"stepfun"
- [2026-09-04 23:35] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel ttft
- [2026-09-04 23:35] stream/dispatch-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:35] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:35] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: ba
- [2026-09-04 23:35] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:35] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:35] stream/dispatch-error (gw) — 206/621","raw":13187,"cached":13184,"ms":43609,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backc
- [2026-09-04 23:35] stream/dispatch-error (gw) — ":"8402/16","raw":7824,"cached":3392,"ms":4794,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backcha
- [2026-09-04 23:35] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:35] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel tt
- [2026-09-04 23:35] stream/dispatch-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:35] stream/dispatch-error (gw) — 1581/940","raw":9859,"cached":10624,"ms":17860,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchanne
- [2026-09-04 23:35] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchanne
- [2026-09-04 23:35] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","status
- [2026-09-04 23:35] stream/dispatch-error (gw) — 171/968","raw":13771,"cached":15872,"ms":45007,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:35] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ce
- [2026-09-04 23:35] stream/dispatch-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"stepfun","t
- [2026-09-04 23:35] stream/dispatch-error (gw) — tok":"4411/32","raw":3870,"cached":0,"ms":3632,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:35] stream/dispatch-error (gw) — 6025/357","raw":14320,"cached":13312,"ms":8365,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — 8343/722","raw":17408,"cached":16640,"ms":9064,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — 0543/446","raw":18723,"cached":18432,"ms":6841,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — 2143/534","raw":11840,"cached":8576,"ms":16111,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:35] stream/dispatch-error (gw) — 8506/278","raw":17061,"cached":17408,"ms":5864,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:35] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:35] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — 4289/288","raw":12728,"cached":12288,"ms":6381,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"yolo","to":
- [2026-09-04 23:35] stream/dispatch-error (gw) — tok":"3936/26","raw":3650,"cached":0,"ms":7535,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 23:35] stream/dispatch-error (gw) — ok":"6587/142","raw":6352,"cached":0,"ms":5296,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:35] stream/dispatch-error (gw) — :"6580/173","raw":6357,"cached":3072,"ms":7368,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — "10325/162","raw":9472,"cached":6144,"ms":3956,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 23:35] stream/dispatch-error (gw) — 1050/163","raw":10031,"cached":10240,"ms":4299,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — 3523/142","raw":19545,"cached":21504,"ms":5539,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:35] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel t
- [2026-09-04 23:35] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel
- [2026-09-04 23:35] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] connection failure: backchannel ttft ceilin
- [2026-09-04 23:35] stream/dispatch-error (gw) — dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 23:35] stream/dispatch-error (gw) — 0502/481","raw":18320,"cached":19456,"ms":9174,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — 64/3904","raw":22177,"cached":21504,"ms":55805,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel tt
- [2026-09-04 23:35] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 23:35] stream/dispatch-error (gw) — 93/3494","raw":16049,"cached":15360,"ms":52856,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:35] stream/dispatch-error (gw) — 13/1147","raw":15724,"cached":13312,"ms":18162,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — 0595/128","raw":17075,"cached":18432,"ms":4191,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling)
- [2026-09-04 23:35] stream/dispatch-error (gw) — dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — 42/3723","raw":23786,"cached":23552,"ms":52972,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling)
- [2026-09-04 23:35] stream/dispatch-error (gw) — 9933/330","raw":15963,"cached":18432,"ms":6748,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — :"9755/139","raw":9291,"cached":6656,"ms":4396,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:35] stream/dispatch-error (gw) — ok":"8703/126","raw":8162,"cached":0,"ms":4567,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling)
- [2026-09-04 23:35] stream/dispatch-error (gw) — ok":"8761/115","raw":8570,"cached":0,"ms":6658,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"t

## check 2026-09-04 23:47 — turns=309 failovers=7 cache_hit=65% max_billed=36244
- [2026-09-04 23:47] upstream-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatc
- [2026-09-04 23:47] upstream-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"t
- [2026-09-04 23:47] upstream-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatc
- [2026-09-04 23:47] upstream-error (gw) — 89/1125","raw":12640,"cached":14592,"ms":17733,"ttft":null} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"t
- [2026-09-04 23:47] upstream-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"t
- [2026-09-04 23:47] upstream-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:47] upstream-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"t
- [2026-09-04 23:47] upstream-error (gw) — ispatch hyper] connection failure: The operation timed out. [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"t
- [2026-09-04 23:47] upstream-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatc
- [2026-09-04 23:47] upstream-error (gw) — 2137/105","raw":11123,"cached":11840,"ms":6674,"ttft":null} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:47] upstream-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:47] upstream-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatc
- [2026-09-04 23:47] upstream-error (gw) — ":"7892/74","raw":7448,"cached":7168,"ms":2388,"ttft":null} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:47] upstream-error (gw) — :"9664/147","raw":9175,"cached":8384,"ms":7507,"ttft":null} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"t
- [2026-09-04 23:47] upstream-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"t
- [2026-09-04 23:47] failover (gw) — 1","raw":17731,"cached":16000,"ms":7010,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"tur
- [2026-09-04 23:47] failover (gw) — ","raw":12500,"cached":11904,"ms":10014,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:47] failover (gw) — ateway] connection failure: backchannel ttft ceiling {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"tur
- [2026-09-04 23:47] failover (gw) — 79/288","raw":6008,"cached":0,"ms":7571,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:47] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"tur
- [2026-09-04 23:47] failover (gw) — /341","raw":18939,"cached":0,"ms":62055,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:47] failover (gw) — 8","raw":22860,"cached":8448,"ms":75157,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:47] tunnel-524-timeout (gw) — ,"tier":"flash","why":"theta-hard=llmgateway-flash","tok":"15245/519","raw":14452,"cached":14272,"ms":18246,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"q
- [2026-09-04 23:47] tunnel-524-timeout (gw) — flash","why":"theta-hard=stepfun","tok":"17649/1124","raw":15240,"cached":17280,"ms":45450,"ttft":null} {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"qwen-3.8","to":"qw
- [2026-09-04 23:47] stream/dispatch-error (gw) — "10509/146","raw":9669,"cached":8320,"ms":5768,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — ":"12269/215","raw":11361,"cached":0,"ms":7003,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — 13344/287","raw":12236,"cached":9600,"ms":8084,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] connection failure: backchannel ttft ceilin
- [2026-09-04 23:47] stream/dispatch-error (gw) — dispatch yolo] connection failure: backchannel ttft ceiling [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"t
- [2026-09-04 23:47] stream/dispatch-error (gw) — 19946/70","raw":17949,"cached":19584,"ms":4438,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — 0041/441","raw":17987,"cached":19584,"ms":9177,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — 2202/342","raw":11956,"cached":4480,"ms":36146,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceili
- [2026-09-04 23:47] stream/dispatch-error (gw) — dispatch yolo] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — ":"13587/284","raw":12269,"cached":0,"ms":7706,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"t
- [2026-09-04 23:47] stream/dispatch-error (gw) — "…n \"created\": \"2021-01-02T02:07:03.380Z\",\n \"modif…" [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — 7003/506","raw":15115,"cached":12032,"ms":9540,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: ba
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — 023/412","raw":19703,"cached":13440,"ms":11065,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch hyper] attempt 1 failed (The operatio
- [2026-09-04 23:47] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 23:47] stream/dispatch-error (gw) — 18354/80","raw":17588,"cached":8960,"ms":12899,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — 7822/365","raw":15473,"cached":17408,"ms":7931,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — 2908/388","raw":20042,"cached":19712,"ms":9222,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — ":"16386/46","raw":15680,"cached":0,"ms":21221,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — 262/431","raw":19742,"cached":21888,"ms":12624,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — 883/730","raw":16215,"cached":17536,"ms":13165,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"13556/403","raw":12165,"cached":0,"ms":10306,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — 5098/452","raw":21219,"cached":22912,"ms":9548,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — ":"21314/62","raw":16755,"cached":0,"ms":13004,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — 331/214","raw":15365,"cached":13440,"ms":20283,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 23:47] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"turn","user":"ccf19648","session":"cc734e7
- [2026-09-04 23:47] stream/dispatch-error (gw) — 25/1780","raw":14438,"cached":20224,"ms":49766,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling {"ev":"llmgateway-failover","from":"stepfun","to":"step-
- [2026-09-04 23:47] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ce
- [2026-09-04 23:47] stream/dispatch-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","status
- [2026-09-04 23:47] stream/dispatch-error (gw) — 4679/183","raw":17152,"cached":21376,"ms":7034,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — 5544/443","raw":13693,"cached":14848,"ms":9360,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel t
- [2026-09-04 23:47] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — 204/116","raw":16193,"cached":13440,"ms":32894,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling [upstream stepfun] 429: {"error":{"message":"concurrency
- [2026-09-04 23:47] stream/dispatch-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: ba
- [2026-09-04 23:47] stream/dispatch-error (gw) — 1197/472","raw":14496,"cached":4480,"ms":17086,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","sta
- [2026-09-04 23:47] stream/dispatch-error (gw) — 384/722","raw":15058,"cached":22016,"ms":15080,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch llmgateway] attempt 1 failed (backchann
- [2026-09-04 23:47] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — 1216/54","raw":16926,"cached":13440,"ms":12028,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft
- [2026-09-04 23:47] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — 16231/32","raw":14968,"cached":8960,"ms":11054,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel t
- [2026-09-04 23:47] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":
- [2026-09-04 23:47] stream/dispatch-error (gw) — 4889/274","raw":17291,"cached":24320,"ms":8223,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: ba
- [2026-09-04 23:47] stream/dispatch-error (gw) — 865/755","raw":12589,"cached":13568,"ms":12923,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel tt
- [2026-09-04 23:47] stream/dispatch-error (gw) — patch stepfun] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling [upstream stepfun] 429: {"error":{"message":"concurre
- [2026-09-04 23:47] stream/dispatch-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"theta-failover","from":"stepfun","status":429,
- [2026-09-04 23:47] stream/dispatch-error (gw) — tok":"3544/35","raw":3422,"cached":0,"ms":4518,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel t
- [2026-09-04 23:47] stream/dispatch-error (gw) — tok":"3336/21","raw":3409,"cached":0,"ms":9904,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch hyper] attempt 1 failed (The opera
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 23:47] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 23:47] stream/dispatch-error (gw) — k":"6206/128","raw":6016,"cached":0,"ms":11880,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — ":"7908/97","raw":7099,"cached":3200,"ms":5618,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — k":"6210/129","raw":6026,"cached":0,"ms":15327,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — ok":"8869/224","raw":7917,"cached":0,"ms":6587,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"8415/361","raw":7289,"cached":7424,"ms":9263,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — ok":"7241/197","raw":6883,"cached":0,"ms":8267,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:47] stream/dispatch-error (gw) — 916/282","raw":15086,"cached":17920,"ms":39647,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — k":"6204/124","raw":6019,"cached":0,"ms":31993,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — k":"8152/526","raw":7572,"cached":0,"ms":21395,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: ba
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel t
- [2026-09-04 23:47] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"16322/301","raw":12667,"cached":0,"ms":12827,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — ok":"8360/97","raw":8042,"cached":0,"ms":22855,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 23:47] stream/dispatch-error (gw) — k":"7192/104","raw":6953,"cached":0,"ms":23923,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"8804/118","raw":8439,"cached":6272,"ms":6432,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchanne
- [2026-09-04 23:47] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — ":"9765/64","raw":9321,"cached":8768,"ms":5605,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:47] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"10203/72","raw":9519,"cached":9536,"ms":8129,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","status
- [2026-09-04 23:47] stream/dispatch-error (gw) — ":"16494/24","raw":15664,"cached":0,"ms":32679,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — ok":"8467/106","raw":8027,"cached":0,"ms":7446,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: ba
- [2026-09-04 23:47] stream/dispatch-error (gw) — "10523/108","raw":9809,"cached":9600,"ms":5957,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":
- [2026-09-04 23:47] stream/dispatch-error (gw) — 12033/99","raw":11349,"cached":10112,"ms":6253,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — 218/431","raw":10495,"cached":10496,"ms":12562,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: ba
- [2026-09-04 23:47] stream/dispatch-error (gw) — 2122/239","raw":11452,"cached":11200,"ms":8535,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:47] stream/dispatch-error (gw) — 18619/62","raw":17530,"cached":17472,"ms":2682,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch stepfun] attempt 1 failed (backchannel ttft
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"18177/996","raw":15455,"cached":0,"ms":47455,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — ":"9096/16","raw":8314,"cached":8768,"ms":5193,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch hyper] connection failure: The ope
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch hyper] connection failure: The operation timed out. [dispatch llmgateway] connection failure: backchannel ttft
- [2026-09-04 23:47] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:47] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel t
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:47] stream/dispatch-error (gw) — 13875/84","raw":13106,"cached":12480,"ms":6251,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: ba
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:47] stream/dispatch-error (gw) — 57/2616","raw":18801,"cached":21120,"ms":68540,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"hyper","to"
- [2026-09-04 23:47] stream/dispatch-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [dispatch hyper] connection failure: The operation timed out. {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"
- [2026-09-04 23:47] stream/dispatch-error (gw) — 19001/33","raw":17778,"cached":18880,"ms":6153,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: ba
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: ba
- [2026-09-04 23:47] stream/dispatch-error (gw) — p-3.7-flash","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep"
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"10398/34","raw":9596,"cached":9600,"ms":5147,"ttft":null} [dispatch hyper] connection failure: The operation timed out. [upstream stepfun] 429: {"error":{"message":"concurrency r
- [2026-09-04 23:47] stream/dispatch-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel t
- [2026-09-04 23:47] stream/dispatch-error (gw) — 4541/182","raw":13336,"cached":14528,"ms":7932,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:47] stream/dispatch-error (gw) — 1277/59","raw":10508,"cached":10944,"ms":19704,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — 11364/33","raw":10539,"cached":11264,"ms":5055,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"hyper","
- [2026-09-04 23:47] stream/dispatch-error (gw) — en3.8-flash","cause":"connection:The operation timed out."} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"12097/426","raw":10264,"cached":0,"ms":36447,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel t
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"theta-failover","from":"stepfun","sta
- [2026-09-04 23:47] stream/dispatch-error (gw) — 683/779","raw":10771,"cached":11904,"ms":16237,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — /10707","raw":21361,"cached":25344,"ms":521542,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:47] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch hyper] connection failure: The operation ti
- [2026-09-04 23:47] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch hyper] connection failure: The operation timed out. [dispatch llmgateway] connection failure: backchannel ttft
- [2026-09-04 23:47] stream/dispatch-error (gw) — ispatch hyper] connection failure: The operation timed out. [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — 305/680","raw":13532,"cached":14272,"ms":46791,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backc
- [2026-09-04 23:47] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: ba
- [2026-09-04 23:47] stream/dispatch-error (gw) — 825/714","raw":10877,"cached":12544,"ms":40987,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — 11864/33","raw":10892,"cached":10368,"ms":5379,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backcha
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 23:47] stream/dispatch-error (gw) — yper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation timed out.), retrying {"ev":"theta-failover","from":"stepfun","status":
- [2026-09-04 23:47] stream/dispatch-error (gw) — 3425/133","raw":11155,"cached":11776,"ms":7533,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — tok":"3416/21","raw":3420,"cached":0,"ms":5368,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — ok":"6271/158","raw":6006,"cached":0,"ms":2700,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"llmgateway-failover","from":"stepfun","to":"st
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"7227/102","raw":6900,"cached":3392,"ms":6378,"ttft":null} [dispatch stepfun] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep"
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"7756/243","raw":7632,"cached":2048,"ms":7147,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:47] stream/dispatch-error (gw) — 4687/163","raw":13548,"cached":12288,"ms":4154,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:47] stream/dispatch-error (gw) — 5213/159","raw":13924,"cached":10240,"ms":4037,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — "12872/167","raw":11972,"cached":896,"ms":8145,"ttft":null} [dispatch hyper] attempt 1 failed (The operation timed out.), retrying [dispatch hyper] attempt 1 failed (The operation
- [2026-09-04 23:47] stream/dispatch-error (gw) — 9042/191","raw":17273,"cached":16384,"ms":4384,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:47] stream/dispatch-error (gw) — 10264/392","raw":9612,"cached":6272,"ms":10688,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — 2466/166","raw":20196,"cached":18432,"ms":4513,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:47] stream/dispatch-error (gw) — 13284/240","raw":12298,"cached":9664,"ms":9027,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":"concu
- [2026-09-04 23:47] stream/dispatch-error (gw) — 3198/200","raw":20796,"cached":21632,"ms":4610,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"backchannel-failover","from":"yolo","to":"feih
- [2026-09-04 23:47] stream/dispatch-error (gw) — "11028/1240","raw":10170,"cached":0,"ms":14676,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:47] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"dispatch-degraded","from":"qwen3.8-ma
- [2026-09-04 23:47] stream/dispatch-error (gw) — 605/683","raw":11713,"cached":13312,"ms":39872,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:47] stream/dispatch-error (gw) — qwen3.8-27b","cause":"connection:backchannel ttft ceiling"} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel t
- [2026-09-04 23:47] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"8574/290","raw":7723,"cached":6272,"ms":7009,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:47] stream/dispatch-error (gw) — 279/945","raw":14696,"cached":15616,"ms":17959,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734
- [2026-09-04 23:47] stream/dispatch-error (gw) — 5670/142","raw":22708,"cached":24960,"ms":4076,"ttft":null} [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"llmgateway-failover","from":"yolo","to":
- [2026-09-04 23:47] stream/dispatch-error (gw) — qwen3.8-27b","cause":"connection:backchannel ttft ceiling"} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel t
- [2026-09-04 23:47] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch stepfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel t
- [2026-09-04 23:47] stream/dispatch-error (gw) — pfun] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [upstream stepfun] 429: {"error":{"message":"concu
- [2026-09-04 23:47] stream/dispatch-error (gw) — ":"16151/31","raw":15050,"cached":0,"ms":16707,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:47] stream/dispatch-error (gw) — :"18858/113","raw":16973,"cached":0,"ms":60991,"ttft":null} [dispatch yolo] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","ep":"t

## 2026-09-04 (zombie correction — why 8/8 still 429'd)

Q: user-specified limits (stepfun 8, agnes 4) were correctly implemented —
why did the server report current:9, limit:8?
A: client/server accounting drift. Two contributors:
1. **TTFT-ceiling zombies**: 25s aborts on stepfun (p90=24s → ~10% of turns
   crossed it) release OUR slot but StepFun keeps the request running
   server-side, holding its slot. Zombie waves + fresh dispatches = 8+ on
   the server while our mirror read <8. Fixed: stepfun exempt from the
   25s ceiling (10-min, same as hyper).
2. **429 double-count**: non-2xx responses held the slot until body-consume
   while theta-failover already re-dispatched (fixed in prior commit).
Caveat owned: the 25s ceiling itself was my earlier change for the yolo
wedge — correct for yolo, wrong scope for stepfun.

## check 2026-09-04 23:59 — turns=52 failovers=12 cache_hit=77% max_billed=43804
- [2026-09-04 23:59] upstream-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:59] upstream-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} {"ev":"t
- [2026-09-04 23:59] upstream-error (gw) — \"code\":\"\",\"message\":\"无效的令牌 (request id: 2026090418"} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:59] upstream-error (gw) — 20260904182606760514653Caje7Qzx)","type":"AgnesAI_error"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:59] upstream-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:59] upstream-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 10, limit: 8","type":"rate_limited"}} [upstre
- [2026-09-04 23:59] upstream-error (gw) — ncy reached, current: 10, limit: 8","type":"rate_limited"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [upstrea
- [2026-09-04 23:59] upstream-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [upstream stepfun] 429: {"error":{"message":"concurrency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatc
- [2026-09-04 23:59] failover (gw) — ateway] connection failure: backchannel ttft ceiling {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"bac
- [2026-09-04 23:59] failover (gw) — ":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"bac
- [2026-09-04 23:59] failover (gw) — ":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:59] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [dispatch
- [2026-09-04 23:59] failover (gw) — 101","raw":7195,"cached":3328,"ms":3502,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"tur
- [2026-09-04 23:59] failover (gw) — 120","raw":8380,"cached":7168,"ms":3537,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"bac
- [2026-09-04 23:59] failover (gw) — — short backoff 2000ms, then failover if still busy {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"llm
- [2026-09-04 23:59] failover (gw) — 8/327","raw":14774,"cached":0,"ms":7866,"ttft":null} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"tur
- [2026-09-04 23:59] failover (gw) — -27b","cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} {"ev":"bac
- [2026-09-04 23:59] failover (gw) — -27b","cause":"connection:backchannel ttft ceiling"} {"ev":"backchannel-failover","from":"yolo","to":"feihoa","status":502,"cause":"connection:backchannel ttft ceiling"} [feihoa] 4
- [2026-09-04 23:59] stream/dispatch-error (gw) — \":{\"message\":\"concurrency reached, current: 9, limit:"} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:59] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [upstream agnes] 401: {"error":{"code":"","m
- [2026-09-04 23:59] stream/dispatch-error (gw) — ency reached, current: 9, limit: 8","type":"rate_limited"}} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:59] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:59] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:59] stream/dispatch-error (gw) — 20305/34","raw":19361,"cached":20160,"ms":7169,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchanne
- [2026-09-04 23:59] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:59] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:59] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:59] stream/dispatch-error (gw) — 112/547","raw":14527,"cached":14528,"ms":41773,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:59] stream/dispatch-error (gw) — 373/250","raw":20361,"cached":20480,"ms":10338,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"backchannel-failover","from":"yolo","to":"feih
- [2026-09-04 23:59] stream/dispatch-error (gw) — "status":502,"cause":"connection:backchannel ttft ceiling"} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:59] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:59] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel t
- [2026-09-04 23:59] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:59] stream/dispatch-error (gw) — eway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [feihoa] 429 — short backoff 2000ms, then fa
- [2026-09-04 23:59] stream/dispatch-error (gw) — oa] 429 — short backoff 2000ms, then failover if still busy [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] attempt 1 failed (back
- [2026-09-04 23:59] stream/dispatch-error (gw) — ":"43668/77","raw":25050,"cached":0,"ms":61499,"ttft":null} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:59] stream/dispatch-error (gw) — 685/505","raw":16406,"cached":17664,"ms":39774,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:59] stream/dispatch-error (gw) — 84/1028","raw":18424,"cached":17664,"ms":49700,"ttft":null} [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel
- [2026-09-04 23:59] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:59] stream/dispatch-error (gw) — 078/617","raw":13773,"cached":13312,"ms":13356,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:59] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchan
- [2026-09-04 23:59] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling {"ev":"turn","user":"ccf19648","session":"cc734e71","
- [2026-09-04 23:59] stream/dispatch-error (gw) — qwen3.8-27b","cause":"connection:backchannel ttft ceiling"} [dispatch llmgateway] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc
- [2026-09-04 23:59] stream/dispatch-error (gw) — 5329/1037","raw":4217,"cached":4096,"ms":73916,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71
- [2026-09-04 23:59] stream/dispatch-error (gw) — 13/5204","raw":16451,"cached":16640,"ms":66344,"ttft":null} [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch yolo] attempt 1 failed (backchannel ttft
- [2026-09-04 23:59] stream/dispatch-error (gw) — yolo] attempt 1 failed (backchannel ttft ceiling), retrying [dispatch llmgateway] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ce
- [2026-09-04 23:59] stream/dispatch-error (gw) — ch llmgateway] connection failure: backchannel ttft ceiling [dispatch yolo] attempt 1 failed (backchannel ttft ceiling), retrying {"ev":"turn","user":"ccf19648","session":"cc734e71

## 2026-09-04 (full log sweep, commit 6a1cac6)

Issues found in a complete pass over both gateway logs + ledger:
1. **Client-disconnect waste**: cancelled clients left 12-min 25K-token
   generations running on Hyper (~$0.83 wasted in one hour across 27 turns).
   Fixed: c.req.raw.signal propagates to upstream AbortController (both
   routes), retry-skip on abort.
2. **llmgateway TTFT mis-scoping**: 25s ceiling failed 25 turns (its p90 is
   41s) with 502s. Ceiling was for yolo's silent wedge; llmgateway has no
   server concurrency slots — exempted (10-min like hyper).
3. **stepfun 'current: 10' max observed** — pre-fix zombie waves; mirror
   now 6/8 with cooldown, ceiling exempt.
Known-benign: feihoa 429 single-retry (by design); feihoa 27B empty-output
(escalation streak handles); ngrok GET /health 404 (route cosmetic).

## check 2026-09-05 00:11 — turns=0 failovers=0 cache_hit=0% max_billed=0
- [2026-09-05 00:11] stream/dispatch-error (gw) — eeded 1357 turns: 1h=0.82M/3M, 24h=9.76M/14M, softDeny=true [dispatch hyper] client disconnected mid-generation — aborting turn

## check 2026-09-05 00:23 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-05 00:35 — turns=0 failovers=0 cache_hit=0% max_billed=0
- no new issues

## check 2026-09-05 00:47 — turns=7 failovers=0 cache_hit=46% max_billed=10277
- no new issues

## 2026-09-05 (full-share cap blown — 2 root causes, commit e164870)

User alarm: full-tier (max) routing way past the 10% cap. Verified:
- Displayed share 8.9% but REAL qwen-3.8 full-share was 23.4% (189/807).
- Cause 1: weeklyFullShare denominator included theta turns (1300+/2h,
  flash-tier, never upgrade) → diluted the metric. Fixed: frontier-only.
- Cause 2: single fix-looping session (cc734e71) drove 22 max turns/min,
  189 in 2h via sticky-escalate — no per-session bound. Fixed: 30
  escalations/hour/session, beyond which hard turns serve on the
  locked free/flash lane.
- Also fixed this session: 27b→llmgateway paid leak (commit 8d440bf).
- $20 hyper burn audit: Sep-4 spend ($18.78) predates budget tracker;
  Sep-5 burn $0.22 (tracker + all leak fixes live). Hyper remaining
  $55.66 (1113 credits, live probe).

## 2026-09-05 (agnes zero-calls — upstream dead, commit c41d13e)

Q: theta me agnes pe ek bhi call kyun nahi gayi (chain me first hai)?
A: Agnes subscription EXPIRED. Key cpk-6nJ52VUs... (working Aug 17 per
gitforge registry live-probe) ab har model pe 401 invalid-token /
402 subscription_not_found deta hai. Routing sahi tha — pehli 401 pe
markAgnesDead → stepfun ne 785 theta turns absorb kiye ($0 flat).
Cooldown 30min → 6h extended (subscription death minutes me heal nahi
hoti; har 30min wasted retry round-trip tha).
ACTION (user): Agnes subscription renew karo → key wahi rahegi →
gateway restart pe lane wapas on (ya 6h cooldown khud expire).
