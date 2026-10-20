"""
Sentinel confidence decay (backend/api/sentinel.py) — section 4: "Confidence must decay
with distance from the sentinel... Model this explicitly and show it." These tests assert
the actual invariants that claim depends on, not just that build_field() runs.
"""

from api.sentinel import DECAY_RATE, build_field, decayed_confidence
from api.tiers import UNKNOWN_CONFIDENCE_FLOOR


def test_confidence_strictly_decreases_with_ring():
    base = 0.95
    confidences = [decayed_confidence(base, ring) for ring in range(6)]
    for a, b in zip(confidences, confidences[1:]):
        assert b < a, f"confidence must strictly decrease with distance, got {confidences}"


def test_sentinel_itself_is_full_confidence_and_measured():
    cells = build_field(base_confidence=0.9, covered_count=50)
    sentinel_cell = cells[0]
    assert sentinel_cell.ring == 0
    assert sentinel_cell.is_measured is True
    assert sentinel_cell.confidence == 0.9
    assert sentinel_cell.is_unknown is False


def test_all_non_sentinel_cells_are_inferred_not_measured():
    cells = build_field(base_confidence=0.9, covered_count=200)
    for cell in cells[1:]:
        assert cell.is_measured is False, "section 4: only the sentinel itself is 'measured' — everyone else is inferred"


def test_far_enough_cells_become_unknown_not_a_false_guess():
    """Section 8's honesty floor applies to spatial decay too: a cell too far from the
    sentinel must say 'unknown', never present a confident-looking number it can't back up."""
    cells = build_field(base_confidence=0.95, covered_count=5000)
    far_cells = [c for c in cells if c.ring >= 4]
    assert far_cells, "test setup should reach rings this far out"
    for c in far_cells:
        assert c.is_unknown, f"ring {c.ring} at confidence {c.confidence} should be unknown (floor={UNKNOWN_CONFIDENCE_FLOOR})"
        assert c.confidence < UNKNOWN_CONFIDENCE_FLOOR


def test_larger_block_size_reaches_further_lower_confidence_rings():
    """Section 4: 'let the user set the block size and watch the inferred confidence
    change' — a bigger block must actually reach further (lower-confidence) rings, not just
    silently cap at the same handful of cells."""
    small = build_field(base_confidence=0.9, covered_count=5)
    large = build_field(base_confidence=0.9, covered_count=2000)
    assert max(c.ring for c in large) > max(c.ring for c in small)


def test_covered_count_of_one_is_just_the_sentinel():
    cells = build_field(base_confidence=0.9, covered_count=1)
    assert len(cells) == 1
    assert cells[0].is_measured is True


def test_decay_rate_is_between_zero_and_one():
    """Sanity bound on the constant itself — anything outside (0, 1) would mean confidence
    either doesn't decay or inverts/grows, silently breaking every test above's premise."""
    assert 0 < DECAY_RATE < 1
