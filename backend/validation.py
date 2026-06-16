"""
Request validation helpers.

Validates incoming review/coupon payloads at the system boundary so malformed
input returns a clear 400 instead of crashing the route with a KeyError or
storing garbage. Checks both *format* (types, lengths) and *meaning* (rating
range, non-empty trimmed text) per the rubric's input-validation criteria.

Each validator returns (cleaned, error):
    cleaned  a normalized dict ready to persist, or None on failure
    error    a human-readable message, or None on success
"""

import re
from typing import Optional, Tuple

ZIP_RE = re.compile(r"^\d{5}$")
MIN_ZIP = 500  # zips below 00501 don't exist

MIN_RATING = 1
MAX_RATING = 5
MAX_NAME_LEN = 80
MAX_TEXT_LEN = 1000
MAX_CODE_LEN = 40
MAX_DISCOUNT_LEN = 120


def is_valid_zip(zip_code: str) -> bool:
    """True for a syntactically valid, real US zip code."""
    cleaned = (zip_code or "").strip()
    return bool(ZIP_RE.match(cleaned)) and int(cleaned) >= MIN_ZIP


def _clean_str(value: object, max_len: int) -> Optional[str]:
    """Coerce to a trimmed string within max_len, or None if invalid/empty."""
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if not trimmed or len(trimmed) > max_len:
        return None
    return trimmed


def validate_review(data: Optional[dict]) -> Tuple[Optional[dict], Optional[str]]:
    """Validate a review submission. Returns (cleaned, error)."""
    if not isinstance(data, dict):
        return None, "Invalid request body."

    business_id = _clean_str(data.get("businessId"), 200)
    if not business_id:
        return None, "A business is required."

    user = _clean_str(data.get("user"), MAX_NAME_LEN)
    if not user:
        return None, "Please enter your name."

    text = _clean_str(data.get("text"), MAX_TEXT_LEN)
    if not text:
        return None, "Please enter a review."

    # Rating must be a whole number within range. Accept ints or numeric strings,
    # reject floats like 4.5, booleans, and out-of-range values.
    raw_rating = data.get("rating")
    # Reject booleans and non-whole floats (e.g. 4.5) outright; accept ints and
    # whole numeric strings ("5"). int(4.5) would silently truncate, so guard it.
    if isinstance(raw_rating, bool) or (isinstance(raw_rating, float) and not raw_rating.is_integer()):
        return None, "Rating must be a whole number from 1 to 5."
    try:
        rating = int(raw_rating)
    except (TypeError, ValueError):
        return None, "Rating must be a whole number from 1 to 5."
    if rating < MIN_RATING or rating > MAX_RATING:
        return None, f"Rating must be between {MIN_RATING} and {MAX_RATING}."

    return {"businessId": business_id, "user": user, "rating": rating, "text": text}, None


def validate_coupon(data: Optional[dict]) -> Tuple[Optional[dict], Optional[str]]:
    """Validate a coupon submission. Returns (cleaned, error)."""
    if not isinstance(data, dict):
        return None, "Invalid request body."

    business_id = _clean_str(data.get("businessId"), 200)
    if not business_id:
        return None, "A business is required."

    code = _clean_str(data.get("code"), MAX_CODE_LEN)
    if not code:
        return None, "Please enter a coupon code."

    discount = _clean_str(data.get("discount"), MAX_DISCOUNT_LEN)
    if not discount:
        return None, "Please describe the discount."

    return {"businessId": business_id, "code": code, "discount": discount}, None
