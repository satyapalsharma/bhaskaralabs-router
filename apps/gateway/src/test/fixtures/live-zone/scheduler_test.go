package scheduler

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

var errBoom = errors.New("boom")

func ok(context.Context) error   { return nil }
func fail(context.Context) error { return errBoom }

func newTestScheduler(t *testing.T, workers int) (*Scheduler, *time.Time, chan Result) {
	t.Helper()
	s, err := New(workers)
	if err != nil {
		t.Fatalf("unexpected error from New: %v", err)
	}
	clock := time.Date(2026, 3, 14, 9, 26, 53, 0, time.UTC)
	s.now = func() time.Time { return clock }
	done := make(chan Result, 16)
	s.OnDone(func(r Result) { done <- r })
	return s, &clock, done
}

func waitResult(t *testing.T, done chan Result) Result {
	t.Helper()
	select {
	case r := <-done:
		return r
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for a job result")
		return Result{}
	}
}

func TestNewRejectsZeroWorkers(t *testing.T) {
	if _, err := New(0); err == nil {
		t.Fatal("expected an error for zero workers, got nil")
	}
}

func TestSpecValidation(t *testing.T) {
	tests := []struct {
		name    string
		spec    Spec
		wantErr string
	}{
		{"empty name", Spec{Every: time.Second, Run: ok}, "job name is empty"},
		{"zero interval", Spec{Name: "a", Run: ok}, "interval must be positive"},
		{"negative timeout", Spec{Name: "a", Every: time.Second, Timeout: -1, Run: ok}, "negative timeout"},
		{"missing func", Spec{Name: "a", Every: time.Second}, "has no Run func"},
		{"bad window", Spec{Name: "a", Every: time.Second, NotBefore: "9am", Run: ok}, "failed to parse window bound"},
		{"valid", Spec{Name: "a", Every: time.Second, NotBefore: "09:00:00", NotAfter: "17:30:00", Run: ok}, ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.spec.validate()
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected an error containing %q, got nil", tc.wantErr)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("error = %q, want it to contain %q", err, tc.wantErr)
			}
		})
	}
}

func TestRegisterDuplicateAndRemoveUnknown(t *testing.T) {
	s, _, _ := newTestScheduler(t, 1)
	if err := s.Register(Spec{Name: "a", Every: time.Second, Run: ok}); err != nil {
		t.Fatalf("unexpected error on first Register: %v", err)
	}
	err := s.Register(Spec{Name: "a", Every: time.Second, Run: ok})
	if !errors.Is(err, ErrDuplicateJob) {
		t.Errorf("second Register error = %v, want ErrDuplicateJob", err)
	}
	if err := s.Remove("missing"); !errors.Is(err, ErrUnknownJob) {
		t.Errorf("Remove error = %v, want ErrUnknownJob", err)
	}
	if _, err := s.Failures("missing"); !errors.Is(err, ErrUnknownJob) {
		t.Errorf("Failures error = %v, want ErrUnknownJob", err)
	}
}

func TestFailureBacksOffAndSuccessResets(t *testing.T) {
	s, clock, done := newTestScheduler(t, 1)
	failing := true
	run := func(context.Context) error {
		if failing {
			return errBoom
		}
		return nil
	}
	if err := s.Register(Spec{Name: "flush", Every: 30 * time.Second, Run: run}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	*clock = clock.Add(30 * time.Second)
	if n, err := s.Tick(context.Background()); err != nil || n != 1 {
		t.Fatalf("first Tick = %d, %v; want 1, nil", n, err)
	}
	r := waitResult(t, done)
	if !errors.Is(r.Err, errBoom) {
		t.Fatalf("result error = %v, want errBoom", r.Err)
	}
	if !strings.HasSuffix(r.String(), "error: scheduler: job flush failed: boom") {
		t.Errorf("run-log line = %q", r.String())
	}
	if failures, err := s.Failures("flush"); err != nil || failures != 1 {
		t.Errorf("Failures = %d, %v; want 1, nil", failures, err)
	}

	// Still failing: second failure doubles the delay.
	*clock = clock.Add(30 * time.Second)
	if n, _ := s.Tick(context.Background()); n != 1 {
		t.Fatalf("second Tick started %d jobs, want 1", n)
	}
	waitResult(t, done)
	*clock = clock.Add(30 * time.Second)
	if due := s.Due(); len(due) != 0 {
		t.Errorf("job due again after 30s despite 2 failures: %v", due)
	}

	failing = false
	*clock = clock.Add(30 * time.Second)
	if n, _ := s.Tick(context.Background()); n != 1 {
		t.Fatalf("third Tick started %d jobs, want 1", n)
	}
	if r := waitResult(t, done); r.Err != nil {
		t.Fatalf("unexpected error after recovery: %v", r.Err)
	}
	if failures, _ := s.Failures("flush"); failures != 0 {
		t.Errorf("failure count not reset after success: %d", failures)
	}
}

func TestMaxRetryRemovesTheJob(t *testing.T) {
	s, clock, done := newTestScheduler(t, 1)
	if err := s.Register(Spec{Name: "doomed", Every: time.Second, MaxRetry: 1, Run: fail}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i := 0; i < 2; i++ {
		*clock = clock.Add(time.Hour)
		if _, err := s.Tick(context.Background()); err != nil {
			t.Fatalf("Tick %d failed: %v", i, err)
		}
		waitResult(t, done)
	}
	if _, err := s.Failures("doomed"); !errors.Is(err, ErrUnknownJob) {
		t.Errorf("job still registered after exceeding MaxRetry: %v", err)
	}
}

func TestTimeoutAndPanicBecomeErrors(t *testing.T) {
	s, clock, done := newTestScheduler(t, 2)
	slow := func(ctx context.Context) error {
		<-ctx.Done()
		return ctx.Err()
	}
	crash := func(context.Context) error { panic("nil map write") }
	if err := s.Register(Spec{Name: "slow", Every: time.Second, Timeout: 10 * time.Millisecond, Run: slow}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := s.Register(Spec{Name: "crash", Every: time.Second, Run: crash}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	*clock = clock.Add(time.Second)
	if n, err := s.Tick(context.Background()); err != nil || n != 2 {
		t.Fatalf("Tick = %d, %v; want 2, nil", n, err)
	}
	got := map[string]error{}
	for i := 0; i < 2; i++ {
		r := waitResult(t, done)
		got[r.Job] = r.Err
	}
	if !errors.Is(got["slow"], context.DeadlineExceeded) {
		t.Errorf("slow job error = %v, want a deadline error", got["slow"])
	}
	if got["crash"] == nil || !strings.Contains(got["crash"].Error(), "panicked: nil map write") {
		t.Errorf("crash job error = %v, want a panic error", got["crash"])
	}
}

func TestStopRefusesNewWork(t *testing.T) {
	s, _, _ := newTestScheduler(t, 1)
	if err := s.Stop(context.Background()); err != nil {
		t.Fatalf("unexpected error from Stop: %v", err)
	}
	if err := s.Register(Spec{Name: "late", Every: time.Second, Run: ok}); !errors.Is(err, ErrStopped) {
		t.Errorf("Register after Stop error = %v, want ErrStopped", err)
	}
	if _, err := s.Tick(context.Background()); !errors.Is(err, ErrStopped) {
		t.Errorf("Tick after Stop error = %v, want ErrStopped", err)
	}
	if err := s.Stop(context.Background()); !errors.Is(err, ErrStopped) {
		t.Errorf("second Stop error = %v, want ErrStopped", err)
	}
}

func TestSelfCheck(t *testing.T) {
	if err := SelfCheck(); err != nil {
		t.Fatalf("self-check failed: %v", err)
	}
}
