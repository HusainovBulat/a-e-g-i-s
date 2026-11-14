from collections import deque

import pytest

from app.engine import _slope_per_min


def test_fatigue_rate_needs_30_seconds_of_history():
    hist = deque((t, 70.0 + 0.5 * t) for t in range(10))  # 10 s of a steep rise
    assert _slope_per_min(hist, 300.0, min_span_s=30.0) is None


def test_fatigue_rate_per_minute_after_enough_history():
    hist = deque((t, 50.0 + 0.1 * t) for t in range(60))  # +0.1 / s == +6 / min
    assert _slope_per_min(hist, 300.0, min_span_s=30.0) == pytest.approx(6.0)
