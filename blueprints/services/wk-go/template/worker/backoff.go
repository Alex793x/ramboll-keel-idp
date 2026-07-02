// Package worker holds the pure scheduling logic for the background worker:
// deterministic, side-effect-free functions (no clock, no I/O, no randomness)
// that are easy to table-test and fuzz. The impure loop lives in main.go.
package worker

import "time"

const (
	// baseDelay is the wait before the first retry.
	baseDelay = 500 * time.Millisecond
	// maxDelay caps the exponential growth of the schedule.
	maxDelay = 60 * time.Second
)

// Backoff returns the delay to wait before retry number attempt (1-based),
// growing exponentially from baseDelay and capped at maxDelay.
//
// It is total and pure: attempt <= 0 yields 0 (no wait before the first try),
// the result is always within [0, maxDelay], and it is monotonically
// non-decreasing in attempt — properties pinned by FuzzBackoffMonotonic.
func Backoff(attempt int) time.Duration {
	if attempt <= 0 {
		return 0
	}
	delay := baseDelay
	for i := 1; i < attempt; i++ {
		delay *= 2
		if delay >= maxDelay {
			return maxDelay
		}
	}
	return delay
}

// Schedule returns the delays for retry attempts 1..attempts, i.e. entry i is
// Backoff(i+1). attempts <= 0 yields nil. The result is non-decreasing.
func Schedule(attempts int) []time.Duration {
	if attempts <= 0 {
		return nil
	}
	delays := make([]time.Duration, attempts)
	for i := range delays {
		delays[i] = Backoff(i + 1)
	}
	return delays
}
