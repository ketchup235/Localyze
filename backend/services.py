"""
Business data services for Localyze.

Responsibilities:
    * geocode a zip code (Nominatim)
    * find nearby independent businesses (Overpass), filtering out chains
    * fall back to a bundled seed dataset when the network is unavailable
    * blend community reviews/coupons onto each business
    * answer help-assistant questions with a keyword matcher

Network calls are best-effort: any failure degrades to the seed dataset rather
than crashing, so the app keeps working offline.
"""

import json
import random
import sqlite3
import ssl
import urllib.parse
import urllib.request
from typing import Optional, Tuple

from seed_data import get_seed_businesses, is_seed_business

ssl._create_default_https_context = ssl._create_unverified_context

NOMINATIM_HEADERS = {"User-Agent": "Localyze/1.0"}
OVERPASS_HEADERS = {"User-Agent": "Localyze/1.0", "Accept-Language": "en-US,en;q=0.9"}
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]
NOMINATIM_TIMEOUT = 10
OVERPASS_TIMEOUT = 20

# Big chains are removed so only genuinely local spots surface.
CHAIN_BLACKLIST = [
    "pizza hut", "mcdonald", "burger king", "subway", "starbucks", "dunkin",
    "domino", "taco bell", "wendy", "cvs", "walgreens", "rite aid", "walmart",
    "target", "lowe's", "home depot", "wawa", "sheetz", "7-eleven",
    "dollar general", "giant", "acme", "wegmans", "kfc", "popeyes", "panera",
    "chipotle",
]

# How much community ratings outweigh the starting base rating once reviews exist.
USER_RATING_WEIGHT = 0.7
BASE_RATING_WEIGHT = 0.3


def resolve_zip_location(zip_code: str) -> Optional[dict]:
    """
    Resolve a zip code to a normalized lat/lon payload using Nominatim.
    Returns None when the lookup fails or no match is found.
    """
    base_url = "https://nominatim.openstreetmap.org/search"
    params = {"q": zip_code, "format": "json", "limit": 1, "countrycodes": "us"}
    req = urllib.request.Request(
        f"{base_url}?{urllib.parse.urlencode(params)}",
        headers=NOMINATIM_HEADERS,
    )
    with urllib.request.urlopen(req, timeout=NOMINATIM_TIMEOUT) as response:
        data = json.loads(response.read())

    if not data:
        return None

    location = data[0]
    return {
        "zip": zip_code,
        "lat": float(location["lat"]),
        "lon": float(location["lon"]),
        "label": location.get("display_name", zip_code),
    }


def _classify(tags: dict) -> str:
    """Map OpenStreetMap tags to one of our three categories."""
    if "amenity" in tags:
        if tags["amenity"] in ["restaurant", "cafe", "fast_food", "bar"]:
            return "food"
        if tags["amenity"] in ["hairdresser", "beauty", "spa", "gym"]:
            return "services"
    return "retail"


def fetch_local_data(zip_code: str) -> list:
    """
    Geocode the zip, query Overpass for nearby businesses, and filter out chains.
    Returns [] on any failure (the caller falls back to seed data).
    """
    businesses: list = []
    try:
        location = resolve_zip_location(zip_code)
        if not location:
            return []

        lat, lon = location["lat"], location["lon"]
        overpass_query = f"""
        [out:json][timeout:25];
        (
          node["amenity"~"restaurant|cafe|bar|pub|ice_cream|fast_food"](around:5000, {lat}, {lon});
          node["amenity"~"hairdresser|beauty|tattoo|spa|gym"](around:5000, {lat}, {lon});
          node["shop"](around:5000, {lat}, {lon});
        );
        out body 40;
        """

        osm_data = None
        last_error: Optional[Exception] = None
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                data_req = urllib.request.Request(
                    endpoint,
                    data=overpass_query.encode("utf-8"),
                    headers=OVERPASS_HEADERS,
                )
                with urllib.request.urlopen(data_req, timeout=OVERPASS_TIMEOUT) as response:
                    osm_data = json.loads(response.read())
                break
            except Exception as exc:  # try the next mirror
                last_error = exc
                continue
        if osm_data is None:
            raise last_error or RuntimeError("Overpass request failed")

        for element in osm_data.get("elements", []):
            tags = element.get("tags", {})
            name = tags.get("name", "Unknown")

            if name == "Unknown":
                continue
            if any(chain in name.lower() for chain in CHAIN_BLACKLIST):
                continue
            if "brand" in tags:  # OSM marks chain locations with a brand tag
                continue

            businesses.append(
                {
                    "id": str(element["id"]),
                    "name": name,
                    "category": _classify(tags),
                    "base_rating": round(random.uniform(3.0, 5.0), 1),
                    "address": zip_code,
                }
            )
    except Exception as exc:
        print(f"Live lookup failed for {zip_code}: {exc}")
        return []

    return businesses


def _enrich_with_community_data(conn: sqlite3.Connection, raw_data: list) -> list:
    """Blend stored reviews and coupons onto each raw business record."""
    enhanced = []
    for record in raw_data:
        business = dict(record)
        b_id = business["id"]

        ratings = conn.execute(
            "SELECT rating FROM reviews WHERE business_id = ?", (b_id,)
        ).fetchall()

        if ratings:
            user_ratings = [r["rating"] for r in ratings]
            avg_user_rating = sum(user_ratings) / len(user_ratings)
            final_rating = (avg_user_rating * USER_RATING_WEIGHT) + (
                business["base_rating"] * BASE_RATING_WEIGHT
            )
            business["rating"] = round(final_rating, 1)
            business["review_count"] = len(ratings)
        else:
            business["rating"] = business["base_rating"]
            business["review_count"] = 0

        coupons = conn.execute(
            "SELECT code, discount FROM coupons WHERE business_id = ?", (b_id,)
        ).fetchall()
        business["deals"] = [{"code": c["code"], "discount": c["discount"]} for c in coupons]

        enhanced.append(business)
    return enhanced


def load_businesses(conn: sqlite3.Connection, zip_code: str) -> Tuple[list, str]:
    """
    Return (businesses, source) for a zip, where source is one of:
        "cache"  served from a previous lookup
        "live"   freshly fetched from OpenStreetMap
        "seed"   offline fallback dataset (network unavailable)
        "none"   nothing available for this zip

    Seed results are intentionally NOT cached, so the app retries the live
    lookup (and drops the offline badge) as soon as the network returns.
    """
    cached = conn.execute(
        "SELECT * FROM businesses WHERE zip_code = ?", (zip_code,)
    ).fetchall()

    if cached:
        raw_data = [
            {
                "id": str(row["api_id"]),
                "name": row["name"],
                "category": row["category"],
                "address": row["address"],
                "base_rating": row["base_rating"],
            }
            for row in cached
        ]
        return _enrich_with_community_data(conn, raw_data), "cache"

    raw_data = fetch_local_data(zip_code)
    if raw_data:
        for b in raw_data:
            try:
                conn.execute(
                    "INSERT INTO businesses (api_id, name, category, address, zip_code, base_rating)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    (b["id"], b["name"], b["category"], b["address"], zip_code, b.get("base_rating", 4.0)),
                )
            except sqlite3.IntegrityError:
                pass
        conn.commit()
        return _enrich_with_community_data(conn, raw_data), "live"

    seed = get_seed_businesses(zip_code)
    if seed:
        return _enrich_with_community_data(conn, seed), "seed"

    return [], "none"


def business_exists(conn: sqlite3.Connection, business_id: str) -> bool:
    """
    Semantic check: does this id correspond to a known business - either a
    cached OpenStreetMap result or a bundled seed entry? Reviews and coupons
    for unknown ids are rejected so we never store orphan community data.
    """
    row = conn.execute(
        "SELECT 1 FROM businesses WHERE api_id = ? LIMIT 1", (business_id,)
    ).fetchone()
    if row is not None:
        return True
    return is_seed_business(business_id)


def get_help_response(message: str) -> str:
    """
    Keyword-based intent matcher for the help assistant. Checks the message
    against topic keyword lists in priority order and returns a pre-written
    answer, or a friendly fallback when nothing matches.
    """
    msg = message.lower().strip()

    topics = [
        (["3d", "shape", "floating", "orbit", "sphere", "hero", "animation", "spin", "rotating", "globe", "earth"],
         "The hero uses a premium rotating Earth. Enter a zip code and the globe will "
         "smoothly zoom to that area so the homepage feels tied to your search."),
        (["captcha", "bot", "verification", "verify", "human", "math", "robot", "spam", "prove"],
         "To prevent spam, Localyze uses a simple math CAPTCHA. When leaving a review or "
         "submitting a coupon, you will see a quick addition problem. Solve it and submit."),
        (["coupon", "deal", "discount", "promo", "code", "offer", "sale", "redeem"],
         "Community coupons are crowd-sourced. Open any business to see coupons or submit your own. "
         "The math CAPTCHA keeps it spam-free."),
        (["pdf", "report", "download", "export", "print", "save file", "document"],
         "Use the PDF export button in the filter bar to generate a report of saved businesses."),
        (["review", "rating", "star", "rate", "feedback", "opinion", "comment", "experience", "leave a"],
         "Open a business, fill in your name, rating, and review text, solve the CAPTCHA, and submit."),
        (["save", "bookmark", "heart", "favorite", "favourite", "like", "keep", "wishlist"],
         "Click the heart icon on a business card to save it locally. Use the Saved filter to view them."),
        (["sort", "order", "rank", "top rated", "best", "most reviewed", "alphabetical", "a-z", "highest"],
         "Use the Sort dropdown to reorder results by rating, review count, or name."),
        (["filter", "category", "food", "retail", "service", "type", "kind", "restaurant", "shop", "store"],
         "Use the category buttons to filter by Food, Retail, Services, or Saved."),
        (["search", "zip", "find", "locate", "area", "nearby", "local", "postcode", "where", "start", "begin"],
         "Enter your 5-digit US zip code in the search bar and press Search."),
        (["hi", "hello", "hey", "help", "what can you do", "what do you do", "sup", "yo", "howdy"],
         "Hi! I can answer questions about Localyze: searching, saving, reviews, coupons, and exporting."),
    ]

    for keywords, answer in topics:
        if any(word in msg for word in keywords):
            return answer

    return (
        "I am not sure about that one. Try asking about zip search, filters, saving, reviews, coupons, or exporting."
    )
