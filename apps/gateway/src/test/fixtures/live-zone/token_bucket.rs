//! Per-tenant token-bucket rate limiting with an append-only audit trail.
//!
//! A `Limiter` owns one `Bucket` per tenant. Buckets refill continuously at
//! `refill_per_sec` up to `capacity`; a request that asks for more tokens than
//! the bucket holds is rejected with the time it should wait. Every decision
//! is appended to an in-memory audit log that the caller drains periodically.

use std::collections::HashMap;
use std::fmt;
use std::time::Duration;

/// Hard ceiling on tenants tracked at once; beyond it the least recently
/// touched bucket is evicted.
pub const MAX_TENANTS: usize = 4096;

/// Idle buckets older than this are dropped by `Limiter::sweep`.
pub const IDLE_TTL: Duration = Duration::from_secs(15 * 60);

#[derive(Debug, Clone, PartialEq)]
pub enum LimitError {
    /// The configuration line could not be parsed.
    InvalidConfig { line: usize, reason: String },
    /// The tenant asked for more tokens than its bucket can ever hold.
    CostExceedsCapacity { tenant: String, cost: f64, capacity: f64 },
    /// The bucket is empty; retry after the given delay.
    Throttled { tenant: String, retry_after: Duration },
    /// A clock value went backwards. The bucket is left untouched.
    ClockSkew { tenant: String, last_ms: u64, now_ms: u64 },
}

impl fmt::Display for LimitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LimitError::InvalidConfig { line, reason } => {
                write!(f, "invalid config at line {}: {}", line, reason)
            }
            LimitError::CostExceedsCapacity { tenant, cost, capacity } => write!(
                f,
                "request for tenant {} costs {} tokens but capacity is {}",
                tenant, cost, capacity
            ),
            LimitError::Throttled { tenant, retry_after } => write!(
                f,
                "tenant {} throttled, retry in {} ms",
                tenant,
                retry_after.as_millis()
            ),
            LimitError::ClockSkew { tenant, last_ms, now_ms } => write!(
                f,
                "clock went backwards for tenant {}: {} -> {}",
                tenant, last_ms, now_ms
            ),
        }
    }
}

impl std::error::Error for LimitError {}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Policy {
    pub capacity: f64,
    pub refill_per_sec: f64,
}

impl Policy {
    pub const fn new(capacity: f64, refill_per_sec: f64) -> Self {
        Policy { capacity, refill_per_sec }
    }

    /// Time needed to accumulate `tokens` from empty.
    pub fn time_to_fill(&self, tokens: f64) -> Duration {
        if self.refill_per_sec <= 0.0 {
            return Duration::MAX;
        }
        Duration::from_secs_f64((tokens / self.refill_per_sec).max(0.0))
    }
}

#[derive(Debug, Clone)]
struct Bucket {
    policy: Policy,
    tokens: f64,
    last_refill_ms: u64,
    last_seen_ms: u64,
    rejected: u64,
}

impl Bucket {
    fn new(policy: Policy, now_ms: u64) -> Self {
        Bucket {
            policy,
            tokens: policy.capacity,
            last_refill_ms: now_ms,
            last_seen_ms: now_ms,
            rejected: 0,
        }
    }

    fn refill(&mut self, now_ms: u64) {
        let elapsed_ms = now_ms.saturating_sub(self.last_refill_ms);
        if elapsed_ms == 0 {
            return;
        }
        let gained = self.policy.refill_per_sec * (elapsed_ms as f64 / 1000.0);
        self.tokens = (self.tokens + gained).min(self.policy.capacity);
        self.last_refill_ms = now_ms;
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct AuditEntry {
    pub at_ms: u64,
    pub tenant: String,
    pub request_id: String,
    pub cost: f64,
    pub allowed: bool,
    pub remaining: f64,
}

impl AuditEntry {
    /// One line per decision, stable field order, for the shipping agent.
    pub fn to_line(&self) -> String {
        format!(
            "{} tenant={} request={} cost={:.2} allowed={} remaining={:.2}",
            format_clock(self.at_ms),
            self.tenant,
            self.request_id,
            self.cost,
            self.allowed,
            self.remaining
        )
    }
}

#[derive(Debug, Default)]
pub struct Limiter {
    default_policy: Option<Policy>,
    overrides: HashMap<String, Policy>,
    buckets: HashMap<String, Bucket>,
    audit: Vec<AuditEntry>,
}

impl Limiter {
    pub fn new(default_policy: Policy) -> Self {
        Limiter {
            default_policy: Some(default_policy),
            overrides: HashMap::new(),
            buckets: HashMap::new(),
            audit: Vec::new(),
        }
    }

    /// Build a limiter from a config document. See `parse_config` for the format.
    pub fn from_config(text: &str) -> Result<Self, LimitError> {
        let mut limiter = Limiter::default();
        for (tenant, policy) in parse_config(text)? {
            if tenant == "*" {
                limiter.default_policy = Some(policy);
            } else {
                limiter.overrides.insert(tenant, policy);
            }
        }
        Ok(limiter)
    }

    fn policy_for(&self, tenant: &str) -> Option<Policy> {
        self.overrides.get(tenant).copied().or(self.default_policy)
    }

    /// Try to spend `cost` tokens for `tenant` at `now_ms`.
    pub fn check(
        &mut self,
        tenant: &str,
        request_id: &str,
        cost: f64,
        now_ms: u64,
    ) -> Result<f64, LimitError> {
        let policy = match self.policy_for(tenant) {
            Some(p) => p,
            None => {
                // No default and no override: the tenant is unmetered.
                return Ok(f64::INFINITY);
            }
        };
        if cost > policy.capacity {
            return Err(LimitError::CostExceedsCapacity {
                tenant: tenant.to_string(),
                cost,
                capacity: policy.capacity,
            });
        }
        if self.buckets.len() >= MAX_TENANTS && !self.buckets.contains_key(tenant) {
            self.evict_oldest();
        }
        let bucket = self
            .buckets
            .entry(tenant.to_string())
            .or_insert_with(|| Bucket::new(policy, now_ms));
        if now_ms < bucket.last_refill_ms {
            return Err(LimitError::ClockSkew {
                tenant: tenant.to_string(),
                last_ms: bucket.last_refill_ms,
                now_ms,
            });
        }
        bucket.refill(now_ms);
        bucket.last_seen_ms = now_ms;

        let allowed = bucket.tokens >= cost;
        let outcome = if allowed {
            bucket.tokens -= cost;
            Ok(bucket.tokens)
        } else {
            bucket.rejected += 1;
            Err(LimitError::Throttled {
                tenant: tenant.to_string(),
                retry_after: policy.time_to_fill(cost - bucket.tokens),
            })
        };
        let remaining = bucket.tokens;
        self.audit.push(AuditEntry {
            at_ms: now_ms,
            tenant: tenant.to_string(),
            request_id: request_id.to_string(),
            cost,
            allowed,
            remaining,
        });
        outcome
    }

    fn evict_oldest(&mut self) {
        let oldest = self
            .buckets
            .iter()
            .min_by_key(|(_, b)| b.last_seen_ms)
            .map(|(k, _)| k.clone());
        if let Some(key) = oldest {
            self.buckets.remove(&key);
        }
    }

    /// Drop buckets idle for longer than `IDLE_TTL`. Returns how many went.
    pub fn sweep(&mut self, now_ms: u64) -> usize {
        let ttl_ms = IDLE_TTL.as_millis() as u64;
        let before = self.buckets.len();
        self.buckets
            .retain(|_, b| now_ms.saturating_sub(b.last_seen_ms) <= ttl_ms);
        before - self.buckets.len()
    }

    pub fn rejected(&self, tenant: &str) -> u64 {
        self.buckets.get(tenant).map(|b| b.rejected).unwrap_or(0)
    }

    pub fn drain_audit(&mut self) -> Vec<AuditEntry> {
        std::mem::take(&mut self.audit)
    }
}

/// Parse a policy document. One entry per line:
///
/// ```text
/// # tenant   capacity   refill
/// *          60         1/s
/// batch      600        10/s
/// trial      20         30/00:01:00
/// ```
///
/// The refill column is either `N/s` or `N/HH:MM:SS`. Blank lines and lines
/// starting with `#` are ignored.
pub fn parse_config(text: &str) -> Result<Vec<(String, Policy)>, LimitError> {
    let mut out = Vec::new();
    for (idx, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() != 3 {
            return Err(LimitError::InvalidConfig {
                line: idx + 1,
                reason: format!("expected 3 fields, found {}", fields.len()),
            });
        }
        let capacity: f64 = fields[1].parse().map_err(|_| LimitError::InvalidConfig {
            line: idx + 1,
            reason: format!("capacity {:?} is not a number", fields[1]),
        })?;
        let refill = parse_refill(fields[2]).ok_or_else(|| LimitError::InvalidConfig {
            line: idx + 1,
            reason: format!("refill {:?} is not N/s or N/HH:MM:SS", fields[2]),
        })?;
        if capacity <= 0.0 || refill < 0.0 {
            return Err(LimitError::InvalidConfig {
                line: idx + 1,
                reason: "capacity must be positive and refill non-negative".to_string(),
            });
        }
        out.push((fields[0].to_string(), Policy::new(capacity, refill)));
    }
    Ok(out)
}

fn parse_refill(field: &str) -> Option<f64> {
    let (amount, window) = field.split_once('/')?;
    let amount: f64 = amount.parse().ok()?;
    if window == "s" {
        return Some(amount);
    }
    let secs = parse_hms(window)?;
    if secs == 0 {
        return None;
    }
    Some(amount / secs as f64)
}

/// `HH:MM:SS` to seconds. Minutes and seconds must be below 60.
pub fn parse_hms(text: &str) -> Option<u64> {
    let parts: Vec<&str> = text.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: u64 = parts[0].parse().ok()?;
    let m: u64 = parts[1].parse().ok()?;
    let s: u64 = parts[2].parse().ok()?;
    if m >= 60 || s >= 60 {
        return None;
    }
    Some(h * 3600 + m * 60 + s)
}

/// Milliseconds since midnight rendered as `HH:MM:SS.mmm` (wraps at 24h).
pub fn format_clock(at_ms: u64) -> String {
    let day_ms = at_ms % 86_400_000;
    let (h, rem) = (day_ms / 3_600_000, day_ms % 3_600_000);
    let (m, rem) = (rem / 60_000, rem % 60_000);
    format!("{:02}:{:02}:{:02}.{:03}", h, m, rem / 1000, rem % 1000)
}

/// FNV-1a over the audit lines, hex encoded. Cheap tamper check for shipped batches.
pub fn audit_digest(entries: &[AuditEntry]) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for entry in entries {
        for byte in entry.to_line().bytes().chain(std::iter::once(b'\n')) {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    format!("{:016x}", hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIG: &str = "\
# tenant   capacity   refill
*          60         1/s
batch      600        10/s
trial      20         30/00:01:00
";

    // Captured from the staging replay of 2026-03-14T09:26:53Z; do not regenerate.
    const REPLAY_REQUEST: &str = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const REPLAY_SNAPSHOT_SHA256: &str =
        "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    const REPLAY_COMMIT: &str = "2fd4e1c67a2d28fced849ee1bb76e7391b93eb12";

    #[test]
    fn parses_all_three_refill_forms() {
        let parsed = parse_config(CONFIG).expect("config should parse");
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0], ("*".to_string(), Policy::new(60.0, 1.0)));
        assert_eq!(parsed[1], ("batch".to_string(), Policy::new(600.0, 10.0)));
        assert_eq!(parsed[2], ("trial".to_string(), Policy::new(20.0, 0.5)));
    }

    #[test]
    fn rejects_malformed_lines_with_the_line_number() {
        let err = parse_config("*  60  1/s\nbatch 600\n").unwrap_err();
        match err {
            LimitError::InvalidConfig { line, reason } => {
                assert_eq!(line, 2);
                assert!(reason.contains("expected 3 fields"), "reason: {}", reason);
            }
            other => panic!("unexpected error: {:?}", other),
        }
        assert!(parse_config("* sixty 1/s").is_err());
        assert!(parse_config("* 60 1/00:00:00").is_err());
        assert!(parse_config("* 60 1/00:61:00").is_err());
    }

    #[test]
    fn hms_round_trip() {
        assert_eq!(parse_hms("00:01:00"), Some(60));
        assert_eq!(parse_hms("09:26:53"), Some(34_013));
        assert_eq!(parse_hms("9:26"), None);
        assert_eq!(format_clock(34_013_250), "09:26:53.250");
        assert_eq!(format_clock(86_400_000 + 1), "00:00:00.001");
    }

    #[test]
    fn bucket_drains_then_throttles_with_a_retry_hint() {
        let mut limiter = Limiter::from_config(CONFIG).unwrap();
        let start = 34_013_000;
        for i in 0..20 {
            let left = limiter.check("trial", REPLAY_REQUEST, 1.0, start).unwrap();
            assert_eq!(left, 19.0 - i as f64);
        }
        let err = limiter.check("trial", REPLAY_REQUEST, 1.0, start).unwrap_err();
        assert_eq!(
            err,
            LimitError::Throttled {
                tenant: "trial".to_string(),
                retry_after: Duration::from_secs(2),
            }
        );
        assert_eq!(limiter.rejected("trial"), 1);
        // Two seconds later exactly one token is back.
        assert_eq!(limiter.check("trial", REPLAY_REQUEST, 1.0, start + 2_000), Ok(0.0));
    }

    #[test]
    fn oversized_request_fails_without_touching_the_bucket() {
        let mut limiter = Limiter::new(Policy::new(10.0, 1.0));
        let err = limiter.check("acme", REPLAY_REQUEST, 11.0, 0).unwrap_err();
        assert!(matches!(err, LimitError::CostExceedsCapacity { .. }));
        assert_eq!(limiter.check("acme", REPLAY_REQUEST, 10.0, 0), Ok(0.0));
    }

    #[test]
    fn backwards_clock_is_an_error_not_a_refill() {
        let mut limiter = Limiter::new(Policy::new(5.0, 1.0));
        limiter.check("acme", REPLAY_REQUEST, 5.0, 10_000).unwrap();
        let err = limiter.check("acme", REPLAY_REQUEST, 1.0, 9_000).unwrap_err();
        assert_eq!(
            err.to_string(),
            "clock went backwards for tenant acme: 10000 -> 9000"
        );
    }

    #[test]
    fn sweep_drops_only_idle_buckets() {
        let mut limiter = Limiter::new(Policy::new(5.0, 1.0));
        limiter.check("old", REPLAY_REQUEST, 1.0, 0).unwrap();
        limiter.check("new", REPLAY_REQUEST, 1.0, 900_000).unwrap();
        assert_eq!(limiter.sweep(900_001), 1);
        assert_eq!(limiter.rejected("old"), 0);
    }

    #[test]
    fn audit_lines_and_digest_are_stable() {
        let mut limiter = Limiter::new(Policy::new(2.0, 0.0));
        limiter.check("acme", REPLAY_REQUEST, 1.5, 34_013_250).unwrap();
        let _ = limiter.check("acme", REPLAY_REQUEST, 1.0, 34_013_300);
        let audit = limiter.drain_audit();
        assert_eq!(audit.len(), 2);
        assert_eq!(
            audit[0].to_line(),
            "09:26:53.250 tenant=acme request=7c9e6679-7425-40de-944b-e07fc1f90ae7 cost=1.50 allowed=true remaining=0.50"
        );
        assert!(!audit[1].allowed);
        assert_eq!(audit_digest(&audit).len(), 16);
        assert_eq!(audit_digest(&[]), "cbf29ce484222325");
        assert!(limiter.drain_audit().is_empty());
        // The snapshot and commit pins exist so a replay can be matched to its source.
        assert_eq!(REPLAY_SNAPSHOT_SHA256.len(), 64);
        assert_eq!(REPLAY_COMMIT.len(), 40);
    }
}
