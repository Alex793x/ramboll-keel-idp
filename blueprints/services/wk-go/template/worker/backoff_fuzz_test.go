package worker

import (
	"math"
	"testing"
	"time"
)

// FuzzBackoffMonotonic pins the properties of Backoff for arbitrary attempts:
// totality (never panics), bounds (always within [0, maxDelay]) and
// monotonicity (waiting never gets shorter as attempts increase). The seed
// corpus runs on every plain `go test`; `go test -fuzz=FuzzBackoffMonotonic`
// explores further.
func FuzzBackoffMonotonic(f *testing.F) {
	for _, seed := range []int{math.MinInt, -1, 0, 1, 2, 7, 8, 100, 1 << 40, math.MaxInt} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, attempt int) {
		got := Backoff(attempt)
		if got < 0 || got > 60*time.Second {
			t.Fatalf("Backoff(%d) = %v, out of [0, 60s]", attempt, got)
		}
		if attempt == math.MaxInt {
			return // attempt+1 would overflow
		}
		if next := Backoff(attempt + 1); next < got {
			t.Fatalf("not monotone: Backoff(%d)=%v > Backoff(%d)=%v", attempt, got, attempt+1, next)
		}
	})
}
