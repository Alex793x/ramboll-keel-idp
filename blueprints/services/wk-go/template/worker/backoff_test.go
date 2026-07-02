package worker

import (
	"testing"
	"time"
)

func TestBackoffTable(t *testing.T) {
	cases := []struct {
		name    string
		attempt int
		want    time.Duration
	}{
		{"no wait before the first try", 0, 0},
		{"total on negative attempts", -3, 0},
		{"first retry", 1, 500 * time.Millisecond},
		{"second retry doubles", 2, time.Second},
		{"fifth retry", 5, 8 * time.Second},
		{"seventh retry still uncapped", 7, 32 * time.Second},
		{"eighth retry hits the cap", 8, 60 * time.Second},
		{"stays capped far out", 10_000, 60 * time.Second},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Backoff(tc.attempt); got != tc.want {
				t.Fatalf("Backoff(%d) = %v, want %v", tc.attempt, got, tc.want)
			}
		})
	}
}

func TestScheduleTable(t *testing.T) {
	if got := Schedule(0); got != nil {
		t.Fatalf("Schedule(0) = %v, want nil", got)
	}
	if got := Schedule(-1); got != nil {
		t.Fatalf("Schedule(-1) = %v, want nil", got)
	}

	got := Schedule(9)
	if len(got) != 9 {
		t.Fatalf("len(Schedule(9)) = %d, want 9", len(got))
	}
	for i := range got {
		if got[i] != Backoff(i+1) {
			t.Fatalf("Schedule(9)[%d] = %v, want Backoff(%d) = %v", i, got[i], i+1, Backoff(i+1))
		}
		if i > 0 && got[i] < got[i-1] {
			t.Fatalf("schedule not monotone at %d: %v < %v", i, got[i], got[i-1])
		}
	}
	if last := got[len(got)-1]; last != 60*time.Second {
		t.Fatalf("schedule tail = %v, want 60s", last)
	}
}
