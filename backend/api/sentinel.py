"""
The sentinel concept — PlantHealth. Section 4 of the brief: one plant in ~100 carries the
device; its reading is extrapolated to its neighbours, with confidence that decays with
distance, and the UI must be honest about measured-vs-inferred.

Simplified geometry: neighbours are modeled as concentric RINGS around the sentinel, not
literal GPS/grid coordinates. Onboarding (section 5 farmer Q4) only collects a rough layout
description (row count + spacing, or a grid size, or "rough sketch") — not individual plant
coordinates — so a literal surveyed map isn't something this data supports. Rings are an
honest abstraction of "further from the sentinel" that the UI can render and the farmer can
understand, not a claim of precise position. Documented here rather than left implicit.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .tiers import UNKNOWN_CONFIDENCE_FLOOR

# Illustrative, not measured from any real deployment — same honesty footnote as
# backend/data/synthetic.py's compressor-confound parameters. A real deployment would
# calibrate DECAY_RATE against how correlated neighbouring plants' actual stress states
# turn out to be, which requires data this demo doesn't have.
DECAY_RATE = 0.75  # confidence multiplier per ring of distance from the sentinel
MAX_RINGS = 6  # visualization cap, independent of how large covered_count gets


@dataclass(frozen=True)
class FieldCell:
    ring: int  # 0 = the sentinel itself
    is_measured: bool
    confidence: float  # decayed, already floored at 0
    is_unknown: bool  # confidence fell below UNKNOWN_CONFIDENCE_FLOOR — show "unknown", not a guess
    cell_count: int  # how many neighbour plants this one visual cell represents


def decayed_confidence(base_confidence: float, ring: int) -> float:
    """Confidence strictly decreases with ring distance — this is the one invariant the
    honesty requirement (section 8) and the sentinel concept (section 4) both depend on;
    see test_sentinel.py for a test that actually asserts monotonicity, not just that the
    formula "looks like" decay."""
    return base_confidence * (DECAY_RATE**ring)


def build_field(base_confidence: float, covered_count: int) -> list[FieldCell]:
    """covered_count neighbour plants (the sentinel + everyone it's extrapolated to),
    bucketed into rings for the field-map visualization. Ring 0 is the sentinel (always
    is_measured=True, full confidence). Remaining plants are spread across up to MAX_RINGS
    further rings, each ring's plants compressed into visual cells so a 1000-plant block
    doesn't render 1000 DOM nodes — cell_count says how many real plants one cell stands for.
    """
    neighbours = max(0, covered_count - 1)
    cells = [FieldCell(ring=0, is_measured=True, confidence=base_confidence, is_unknown=False, cell_count=1)]
    if neighbours == 0:
        return cells

    n_rings = min(MAX_RINGS, max(1, math.ceil(math.sqrt(neighbours))))
    # ring k gets roughly proportional to its "ring area" (2k+1) share of the neighbours,
    # matching the growing-ring-of-cells visual metaphor rather than splitting evenly
    weights = [2 * k + 1 for k in range(1, n_rings + 1)]
    total_weight = sum(weights)
    remaining = neighbours
    for i, k in enumerate(range(1, n_rings + 1)):
        share = neighbours * weights[i] // total_weight
        if k == n_rings:
            share = remaining  # last ring absorbs the remainder (integer rounding)
        share = max(0, min(share, remaining))
        remaining -= share
        if share <= 0:
            continue
        conf = max(0.0, decayed_confidence(base_confidence, k))
        # one cell per ring in the UI (so rendering stays small even for huge blocks); for
        # a ring with few actual plants, split into individually-meaningful cells instead
        cells_in_ring = min(share, 8)
        per_cell = share / cells_in_ring
        for _ in range(cells_in_ring):
            cells.append(FieldCell(
                ring=k, is_measured=False, confidence=round(conf, 4),
                is_unknown=conf < UNKNOWN_CONFIDENCE_FLOOR, cell_count=round(per_cell),
            ))
    return cells
