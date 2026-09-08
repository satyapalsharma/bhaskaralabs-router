#!/bin/bash
# Small-table backup for VPS migration (users, keys, plans survive; heavy
# history does not — usage_ledger/request_archives are TB-scale over time).
# Run on the Mac:  bash scripts/pg-backup.sh   (uses local DATABASE_URL or default)
# Restore on VPS:  psql "$DATABASE_URL" < pg-small-YYYYMMDD.sql
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${DATABASE_URL:-postgres://localhost:5432/bhaskara}"
OUT_DIR="${BACKUP_DIR:-/tmp}"
OUT="$OUT_DIR/pg-small-$(date +%Y%m%d).sql"
TABLES=(
  user session account verification
  api_keys subscriptions coupons coupon_redemptions
  waitlist settings provider_monthly
  doc_packs learned_lessons plan_model_limits
  upstream_providers upstream_accounts upstream_models
  sessions session_locks
)
ARGS=()
for t in "${TABLES[@]}"; do ARGS+=(--table="$t"); done
pg_dump "$DB" --data-only --column-inserts "${ARGS[@]}" > "$OUT"
echo "wrote $OUT ($(wc -l < "$OUT") lines)"
echo "restore: psql \"\$DATABASE_URL\" < $OUT   (AFTER schema push + db-ensure)"
