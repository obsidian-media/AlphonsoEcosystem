import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.auth import require_bearer_token


def test_rejects_when_no_expected_token_is_configured():
    with pytest.raises(HTTPException) as exc:
        require_bearer_token("Bearer anything", "")
    assert exc.value.status_code == 503


def test_rejects_missing_authorization_header():
    with pytest.raises(HTTPException) as exc:
        require_bearer_token(None, "expected-token")
    assert exc.value.status_code == 401


def test_rejects_authorization_header_without_bearer_prefix():
    with pytest.raises(HTTPException) as exc:
        require_bearer_token("expected-token", "expected-token")
    assert exc.value.status_code == 401


def test_accepts_matching_bearer_token():
    require_bearer_token("Bearer expected-token", "expected-token")


def test_rejects_a_completely_wrong_token():
    with pytest.raises(HTTPException) as exc:
        require_bearer_token("Bearer wrong-token", "expected-token")
    assert exc.value.status_code == 403


def test_rejects_an_equal_length_near_miss_token():
    # Regression for the timing-unsafe `!=` comparison this function used to
    # use -- a same-length token differing by a single character must still
    # be rejected outright, not accepted due to a short-circuiting compare.
    expected = "a" * 32
    near_miss = "a" * 31 + "b"
    with pytest.raises(HTTPException) as exc:
        require_bearer_token(f"Bearer {near_miss}", expected)
    assert exc.value.status_code == 403


def test_rejects_a_token_that_only_differs_in_the_last_character():
    expected = "supersecrettoken1234567890"
    near_miss = expected[:-1] + ("0" if expected[-1] != "0" else "1")
    with pytest.raises(HTTPException) as exc:
        require_bearer_token(f"Bearer {near_miss}", expected)
    assert exc.value.status_code == 403
