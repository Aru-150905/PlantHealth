import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


def test_rescaled_top_class_stays_top_even_when_one_other_class_dominates_the_remainder():
    """A neighbour cell's confidence is the sentinel's class decayed with distance. If the
    leftover probability is handed to the other classes proportionally, one of them can end
    up LARGER than the decayed top class — then max(proba) (what the API shows as the
    confidence) goes UP with distance instead of down, and silently belongs to a different
    class. Found as an intermittent failure of
    test_field_endpoint_shows_decaying_confidence_across_rings (depends on the plant's
    random demo reading)."""
    from api.tiers import rescale_proba

    proba = {"drought": 0.95, "heat": 0.049, "healthy": 0.0005, "salinity": 0.0005}
    out = rescale_proba(proba, 0.45)

    assert max(out, key=out.get) == "drought"
    assert max(out.values()) == 0.45
    assert abs(sum(out.values()) - 1.0) < 1e-9
    assert all(v >= 0 for v in out.values())


def test_rescale_keeps_proportions_when_no_cap_is_needed():
    from api.tiers import rescale_proba

    out = rescale_proba({"drought": 0.6, "heat": 0.3, "healthy": 0.1, "salinity": 0.0}, 0.5)
    assert out["drought"] == 0.5
    assert abs(out["heat"] - 0.375) < 1e-9
    assert abs(out["healthy"] - 0.125) < 1e-9
