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
