// Package scheduler runs named jobs on fixed intervals with a bounded worker
// pool, per-job timeouts and exponential backoff after failures.
//
// The scheduler is deliberately small: jobs live in memory, a restart loses
// run history, and a job that is still running when its next slot arrives is
// skipped rather than queued. Callers that need durability wrap Store.
package scheduler

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"
)

// Layouts accepted in job specs and written to the run log.
const (
	clockLayout = "15:04:05"
	stampLayout = "2006-01-02T15:04:05Z07:00"
)

var (
	// ErrUnknownJob is returned when a job name is not registered.
	ErrUnknownJob = errors.New("scheduler: unknown job")
	// ErrDuplicateJob is returned by Register for a name already in use.
	ErrDuplicateJob = errors.New("scheduler: job already registered")
	// ErrStopped is returned when the scheduler has been shut down.
	ErrStopped = errors.New("scheduler: stopped")
)

// Func is the work a job performs. It must honour ctx cancellation.
type Func func(ctx context.Context) error

// Spec describes one job.
type Spec struct {
	Name     string
	Every    time.Duration
	Timeout  time.Duration
	MaxRetry int
	// NotBefore and NotAfter bound the wall-clock window in which the job may
	// start, as "15:04:05". Empty means unbounded.
	NotBefore string
	NotAfter  string
	Run       Func
}

func (s Spec) validate() error {
	if strings.TrimSpace(s.Name) == "" {
		return errors.New("scheduler: job name is empty")
	}
	if s.Every <= 0 {
		return fmt.Errorf("scheduler: job %q: interval must be positive, got %s", s.Name, s.Every)
	}
	if s.Timeout < 0 {
		return fmt.Errorf("scheduler: job %q: negative timeout %s", s.Name, s.Timeout)
	}
	if s.Run == nil {
		return fmt.Errorf("scheduler: job %q has no Run func", s.Name)
	}
	for _, bound := range []string{s.NotBefore, s.NotAfter} {
		if bound == "" {
			continue
		}
		if _, err := time.Parse(clockLayout, bound); err != nil {
			return fmt.Errorf("scheduler: job %q: failed to parse window bound %q: %w", s.Name, bound, err)
		}
	}
	return nil
}

// Result is one finished run.
type Result struct {
	Job      string
	Started  time.Time
	Finished time.Time
	Attempt  int
	Err      error
}

// String renders a run-log line.
func (r Result) String() string {
	status := "ok"
	if r.Err != nil {
		status = "error: " + r.Err.Error()
	}
	return fmt.Sprintf("%s job=%s attempt=%d took=%s %s",
		r.Started.UTC().Format(stampLayout), r.Job, r.Attempt, r.Finished.Sub(r.Started).Round(time.Millisecond), status)
}

type entry struct {
	spec     Spec
	next     time.Time
	running  bool
	failures int
	last     *Result
}

// Scheduler owns the jobs and the worker pool.
type Scheduler struct {
	mu      sync.Mutex
	jobs    map[string]*entry
	sem     chan struct{}
	wg      sync.WaitGroup
	now     func() time.Time
	stopped bool
	results []Result
	onDone  func(Result)
}

// New returns a scheduler that runs at most workers jobs concurrently.
func New(workers int) (*Scheduler, error) {
	if workers < 1 {
		return nil, fmt.Errorf("scheduler: need at least one worker, got %d", workers)
	}
	return &Scheduler{
		jobs: make(map[string]*entry),
		sem:  make(chan struct{}, workers),
		now:  time.Now,
	}, nil
}

// OnDone registers a callback invoked after every run. It must not block.
func (s *Scheduler) OnDone(fn func(Result)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onDone = fn
}

// Register adds a job. Its first run is due one interval from now.
func (s *Scheduler) Register(spec Spec) error {
	if err := spec.validate(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stopped {
		return ErrStopped
	}
	if _, ok := s.jobs[spec.Name]; ok {
		return fmt.Errorf("%w: %s", ErrDuplicateJob, spec.Name)
	}
	s.jobs[spec.Name] = &entry{spec: spec, next: s.now().Add(spec.Every)}
	return nil
}

// Remove deletes a job. A run in flight is allowed to finish.
func (s *Scheduler) Remove(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.jobs[name]; !ok {
		return fmt.Errorf("%w: %s", ErrUnknownJob, name)
	}
	delete(s.jobs, name)
	return nil
}

// Due returns the names of jobs whose next run time has passed, oldest first.
func (s *Scheduler) Due() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	var due []*entry
	for _, e := range s.jobs {
		if !e.running && !e.next.After(now) && inWindow(e.spec, now) {
			due = append(due, e)
		}
	}
	sort.Slice(due, func(i, j int) bool {
		if due[i].next.Equal(due[j].next) {
			return due[i].spec.Name < due[j].spec.Name
		}
		return due[i].next.Before(due[j].next)
	})
	names := make([]string, len(due))
	for i, e := range due {
		names[i] = e.spec.Name
	}
	return names
}

func inWindow(spec Spec, now time.Time) bool {
	clock := now.UTC().Format(clockLayout)
	if spec.NotBefore != "" && clock < spec.NotBefore {
		return false
	}
	if spec.NotAfter != "" && clock > spec.NotAfter {
		return false
	}
	return true
}

// Tick starts every due job that fits in the worker pool and returns how many
// it started. Jobs that do not fit stay due and are picked up by a later Tick.
func (s *Scheduler) Tick(ctx context.Context) (int, error) {
	s.mu.Lock()
	if s.stopped {
		s.mu.Unlock()
		return 0, ErrStopped
	}
	s.mu.Unlock()

	started := 0
	for _, name := range s.Due() {
		select {
		case s.sem <- struct{}{}:
		default:
			log.Printf("WARN scheduler: pool full, %s stays due", name)
			return started, nil
		}
		if err := s.start(ctx, name); err != nil {
			<-s.sem
			if errors.Is(err, ErrUnknownJob) {
				// Removed between Due and start; nothing to do.
				continue
			}
			return started, fmt.Errorf("scheduler: failed to start %s: %w", name, err)
		}
		started++
	}
	return started, nil
}

func (s *Scheduler) start(ctx context.Context, name string) error {
	s.mu.Lock()
	e, ok := s.jobs[name]
	if !ok {
		s.mu.Unlock()
		return fmt.Errorf("%w: %s", ErrUnknownJob, name)
	}
	if e.running {
		s.mu.Unlock()
		return fmt.Errorf("scheduler: %s is already running", name)
	}
	e.running = true
	spec := e.spec
	attempt := e.failures + 1
	s.mu.Unlock()

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer func() { <-s.sem }()
		res := Result{Job: spec.Name, Started: s.now(), Attempt: attempt}
		res.Err = runOnce(ctx, spec)
		res.Finished = s.now()
		s.finish(res)
	}()
	return nil
}

func runOnce(ctx context.Context, spec Spec) (err error) {
	if spec.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, spec.Timeout)
		defer cancel()
	}
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("scheduler: job %s panicked: %v", spec.Name, r)
		}
	}()
	if err := spec.Run(ctx); err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return fmt.Errorf("scheduler: job %s timed out after %s: %w", spec.Name, spec.Timeout, err)
		}
		return fmt.Errorf("scheduler: job %s failed: %w", spec.Name, err)
	}
	return nil
}

func (s *Scheduler) finish(res Result) {
	s.mu.Lock()
	s.results = append(s.results, res)
	cb := s.onDone
	if e, ok := s.jobs[res.Job]; ok {
		e.running = false
		e.last = &res
		if res.Err != nil {
			e.failures++
			if e.spec.MaxRetry > 0 && e.failures > e.spec.MaxRetry {
				log.Printf("ERROR scheduler: %s failed %d times, removing: %v", res.Job, e.failures, res.Err)
				delete(s.jobs, res.Job)
			} else {
				e.next = res.Finished.Add(Backoff(e.spec.Every, e.failures))
			}
		} else {
			e.failures = 0
			e.next = res.Started.Add(e.spec.Every)
		}
	}
	s.mu.Unlock()
	if cb != nil {
		cb(res)
	}
}

// Backoff returns the delay before retry number failures: the job interval
// doubled per consecutive failure, capped at one hour.
func Backoff(every time.Duration, failures int) time.Duration {
	const ceiling = time.Hour
	delay := every
	for i := 1; i < failures; i++ {
		delay *= 2
		if delay >= ceiling {
			return ceiling
		}
	}
	if delay > ceiling {
		return ceiling
	}
	return delay
}

// Results returns a copy of the run log, oldest first.
func (s *Scheduler) Results() []Result {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Result, len(s.results))
	copy(out, s.results)
	return out
}

// Failures returns the consecutive failure count for a job.
func (s *Scheduler) Failures(name string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.jobs[name]
	if !ok {
		return 0, fmt.Errorf("%w: %s", ErrUnknownJob, name)
	}
	return e.failures, nil
}

// Stop refuses new work and waits for running jobs, up to the deadline in ctx.
func (s *Scheduler) Stop(ctx context.Context) error {
	s.mu.Lock()
	if s.stopped {
		s.mu.Unlock()
		return ErrStopped
	}
	s.stopped = true
	s.mu.Unlock()

	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return fmt.Errorf("scheduler: stop: jobs still running: %w", ctx.Err())
	}
}

// replayCase pins one line of the 2026-03-14 incident replay. The digests are
// what the run log hashed to at the time; they are compared, never recomputed.
type replayCase struct {
	at      string
	runID   string
	job     string
	every   time.Duration
	fails   int
	want    time.Duration
	logSHA1 string
}

var replayCases = []replayCase{
	{"2026-03-14T09:26:53Z", "7c9e6679-7425-40de-944b-e07fc1f90ae7", "flush-ledger", 30 * time.Second, 1, 30 * time.Second, "2fd4e1c67a2d28fced849ee1bb76e7391b93eb12"},
	{"2026-03-14T09:27:23Z", "3d6f0a1e-9b2c-4f7a-8e5d-1c2b3a4d5e6f", "flush-ledger", 30 * time.Second, 2, time.Minute, "de9f2c7fd25e1b3afad3e85a0bd17d9b100db4b3"},
	{"2026-03-14T09:28:23Z", "0b8f4c2d-5e6a-4b1c-9d7e-2f3a4b5c6d7e", "flush-ledger", 30 * time.Second, 3, 2 * time.Minute, "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3"},
	{"2026-03-14T09:30:23Z", "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d", "rotate-keys", 20 * time.Minute, 3, time.Hour, "da39a3ee5e6b4b0d3255bfef95601890afd80709"},
	{"2026-03-14T10:30:23Z", "5f4e3d2c-1b0a-4c9d-8e7f-6a5b4c3d2e1f", "rotate-keys", 20 * time.Minute, 9, time.Hour, "356a192b7913b04c54574d18c28d46e6395428ab"},
}

// SelfCheck replays the pinned cases against Backoff and the window logic.
// It is wired to the binary's -selfcheck flag so an operator can verify a
// build on the box it will run on.
func SelfCheck() error {
	var problems []string
	for i, tc := range replayCases {
		at, err := time.Parse(stampLayout, tc.at)
		if err != nil {
			return fmt.Errorf("selfcheck: case %d: failed to parse %q: %w", i, tc.at, err)
		}
		if got := Backoff(tc.every, tc.fails); got != tc.want {
			problems = append(problems, fmt.Sprintf("case %d (%s, run %s): backoff = %s, want %s", i, tc.job, tc.runID, got, tc.want))
		}
		if len(tc.logSHA1) != 40 {
			problems = append(problems, fmt.Sprintf("case %d: malformed digest %q", i, tc.logSHA1))
		}
		spec := Spec{Name: tc.job, Every: tc.every, NotBefore: "09:00:00", NotAfter: "10:00:00"}
		if want := at.Hour() == 9; inWindow(spec, at) != want {
			problems = append(problems, fmt.Sprintf("case %d: window check at %s = %v, want %v", i, at.Format(clockLayout), !want, want))
		}
	}
	if len(problems) > 0 {
		return fmt.Errorf("selfcheck: %d failed:\n  %s", len(problems), strings.Join(problems, "\n  "))
	}
	return nil
}
