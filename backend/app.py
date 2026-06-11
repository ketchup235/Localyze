from flask import Flask, jsonify, request, session
from flask_cors import CORS
import secrets
import urllib.request
import urllib.parse
import json
import random
import sqlite3
import re
import os
from datetime import datetime
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "localyze.db")
NOMINATIM_HEADERS = {"User-Agent": "Localyze/1.0"}
OVERPASS_HEADERS = {"User-Agent": "Localyze/1.0", "Accept-Language": "en-US,en;q=0.9"}
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]
NOMINATIM_TIMEOUT = 10
OVERPASS_TIMEOUT = 20


def init_db():
    """
    sets up the database on first run. creates tables for reviews,
    coupons, and the business cache if they don't already exist.
    """
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    c.execute(
        """CREATE TABLE IF NOT EXISTS reviews
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  business_id TEXT,
                  user TEXT,
                  rating INTEGER,
                  text TEXT,
                  date TEXT)"""
    )

    c.execute(
        """CREATE TABLE IF NOT EXISTS coupons
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  business_id TEXT,
                  code TEXT,
                  discount TEXT,
                  date TEXT)"""
    )

    # cache table so we don't re-fetch the same zip code twice
    c.execute(
        """CREATE TABLE IF NOT EXISTS businesses
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  api_id TEXT UNIQUE,
                  name TEXT,
                  category TEXT,
                  address TEXT,
                  zip_code TEXT,
                  base_rating REAL)"""
    )
    conn.commit()
    conn.close()


init_db()


def get_db_connection():
    # opens db connection and sets row_factory to get dict-like rows back
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def resolve_zip_location(zip_code):
    """
    resolves a zip code to a normalized lat/lon payload using nominatim.
    returns None when the lookup fails or no match is found.
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


def fetch_local_data(location_query):
    """
    takes a zip code, gets its lat/lon from nominatim, then hits the
    overpass api to find nearby businesses. filters out any big chains
    so we only surface actual local spots.
    """
    businesses = []

    # anything in here gets removed. we only want local places
    chain_blacklist = [
        "pizza hut",
        "mcdonald",
        "burger king",
        "subway",
        "starbucks",
        "dunkin",
        "domino",
        "taco bell",
        "wendy",
        "cvs",
        "walgreens",
        "rite aid",
        "walmart",
        "target",
        "lowe's",
        "home depot",
        "wawa",
        "sheetz",
        "7-eleven",
        "dollar general",
        "giant",
        "acme",
        "wegmans",
        "kfc",
        "popeyes",
        "panera",
        "chipotle",
    ]

    try:
        location = resolve_zip_location(location_query)
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
        last_error = None
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
            except Exception as exc:
                last_error = exc
                continue
        if osm_data is None:
            raise last_error or RuntimeError("Overpass request failed")

        for element in osm_data.get("elements", []):
            tags = element.get("tags", {})
            name = tags.get("name", "Unknown")

            if name == "Unknown":
                continue
            if any(chain in name.lower() for chain in chain_blacklist):
                continue
            if "brand" in tags:
                continue  # osm marks chain locations with a brand tag

            category = "retail"
            if "amenity" in tags:
                if tags["amenity"] in ["restaurant", "cafe", "fast_food", "bar"]:
                    category = "food"
                elif tags["amenity"] in ["hairdresser", "beauty", "spa", "gym"]:
                    category = "services"

            base_rating = round(random.uniform(3.0, 5.0), 1)

            businesses.append(
                {
                    "id": str(element["id"]),
                    "name": name,
                    "category": category,
                    "base_rating": base_rating,
                    "address": location_query,
                }
            )

    except Exception as exc:
        print(f"Error: {exc}")
        return []

    return businesses


def get_help_response(message):
    """
    keyword-based intent matcher for the help assistant.
    checks the message against topic keyword lists in priority order
    and returns the right pre-written answer. if nothing matches,
    gives a friendly fallback with suggestions.
    """
    msg = message.lower().strip()

    if any(
        w in msg
        for w in ["3d", "shape", "floating", "orbit", "sphere", "hero", "animation", "spin", "rotating", "globe", "earth"]
    ):
        return (
            "The hero uses a premium rotating Earth. Enter a zip code and the globe will "
            "smoothly zoom to that area so the homepage feels tied to your search."
        )

    if any(w in msg for w in ["captcha", "bot", "verification", "verify", "human", "math", "robot", "spam", "prove"]):
        return (
            "To prevent spam, Localyze uses a simple math CAPTCHA. When leaving a review or "
            "submitting a coupon, you will see a quick addition problem. Solve it and submit."
        )

    if any(w in msg for w in ["coupon", "deal", "discount", "promo", "code", "offer", "sale", "redeem"]):
        return (
            "Community coupons are crowd-sourced. Open any business to see coupons or submit your own. "
            "The math CAPTCHA keeps it spam-free."
        )

    if any(w in msg for w in ["pdf", "report", "download", "export", "print", "save file", "document"]):
        return (
            "Use the PDF export button in the filter bar to generate a report of saved businesses."
        )

    if any(w in msg for w in ["review", "rating", "star", "rate", "feedback", "opinion", "comment", "experience", "leave a"]):
        return (
            "Open a business, fill in your name, rating, and review text, solve the CAPTCHA, and submit."
        )

    if any(w in msg for w in ["save", "bookmark", "heart", "favorite", "favourite", "like", "star", "keep", "wishlist"]):
        return (
            "Click the heart icon on a business card to save it locally. Use the Saved filter to view them."
        )

    if any(w in msg for w in ["sort", "order", "rank", "top rated", "best", "most reviewed", "alphabetical", "a-z", "highest"]):
        return (
            "Use the Sort dropdown to reorder results by rating, review count, or name."
        )

    if any(w in msg for w in ["filter", "category", "food", "retail", "service", "type", "kind", "restaurant", "shop", "store"]):
        return (
            "Use the category buttons to filter by Food, Retail, Services, or Saved."
        )

    if any(w in msg for w in ["search", "zip", "find", "locate", "area", "nearby", "local", "postcode", "where", "start", "begin"]):
        return (
            "Enter your 5-digit US zip code in the search bar and press Search."
        )

    if any(w in msg for w in ["hi", "hello", "hey", "help", "what can you do", "what do you do", "sup", "yo", "howdy"]):
        return (
            "Hi! I can answer questions about Localyze: searching, saving, reviews, coupons, and exporting."
        )

    return (
        "I am not sure about that one. Try asking about zip search, filters, saving, reviews, coupons, or exporting."
    )


@app.get("/")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/location")
def get_location():
    zip_code = request.args.get("zip", "").strip()

    if not zip_code or not re.match(r"^\d{5}$", zip_code) or int(zip_code) < 500:
        return jsonify({"success": False, "error": "Invalid zip code"}), 400

    try:
        location = resolve_zip_location(zip_code)
    except Exception as exc:
        print(f"Location lookup error: {exc}")
        return jsonify({"success": False, "error": "Unable to resolve zip code"}), 502

    if not location:
        return jsonify({"success": False, "error": "Zip code not found"}), 404

    return jsonify({"success": True, "location": location})


@app.get("/api/businesses")
def get_businesses():
    """
    main data route. checks the sqlite cache first. if we've seen this zip
    before, we return it instantly. otherwise we fetch from openstreetmap,
    save the results, then enrich everything with reviews and coupons before
    sending it back to the frontend.
    """
    zip_code = request.args.get("zip", "").strip()

    if not zip_code or not re.match(r"^\d{5}$", zip_code) or int(zip_code) < 500:
        return jsonify([])

    conn = get_db_connection()
    raw_data = []

    db_businesses = conn.execute("SELECT * FROM businesses WHERE zip_code = ?", (zip_code,)).fetchall()

    if len(db_businesses) > 0:
        for b in db_businesses:
            raw_data.append(
                {
                    "id": str(b["api_id"]),
                    "name": b["name"],
                    "category": b["category"],
                    "address": b["address"],
                    "base_rating": b["base_rating"],
                }
            )
    else:
        raw_data = fetch_local_data(zip_code)

        for b in raw_data:
            try:
                conn.execute(
                    "INSERT INTO businesses (api_id, name, category, address, zip_code, base_rating) VALUES (?, ?, ?, ?, ?, ?)",
                    (b["id"], b["name"], b["category"], b["address"], zip_code, b.get("base_rating", 4.0)),
                )
            except sqlite3.IntegrityError:
                pass
        conn.commit()

    enhanced_data = []

    for b in raw_data:
        business = b.copy()
        b_id = business["id"]

        reviews = conn.execute("SELECT rating FROM reviews WHERE business_id = ?", (b_id,)).fetchall()

        if reviews:
            user_ratings = [r["rating"] for r in reviews]
            avg_user_rating = sum(user_ratings) / len(user_ratings)
            final_rating = (avg_user_rating * 0.7) + (business["base_rating"] * 0.3)
            business["rating"] = round(final_rating, 1)
            business["review_count"] = len(reviews)
        else:
            business["rating"] = business["base_rating"]
            business["review_count"] = 0

        coupons = conn.execute("SELECT code, discount FROM coupons WHERE business_id = ?", (b_id,)).fetchall()
        business["deals"] = [{"code": c["code"], "discount": c["discount"]} for c in coupons]

        enhanced_data.append(business)

    conn.close()
    return jsonify(enhanced_data)


@app.get("/api/reviews/<id>")
def get_reviews(id):
    conn = get_db_connection()
    db_reviews = conn.execute(
        "SELECT user, rating, text, date FROM reviews WHERE business_id = ? ORDER BY id DESC", (id,)
    ).fetchall()
    conn.close()

    reviews_list = [dict(row) for row in db_reviews]
    return jsonify(reviews_list)


@app.post("/api/review")
def add_review():
    data = request.json
    conn = get_db_connection()
    conn.execute(
        "INSERT INTO reviews (business_id, user, rating, text, date) VALUES (?, ?, ?, ?, ?)",
        (data["businessId"], data["user"], data["rating"], data["text"], datetime.now().strftime("%Y-%m-%d")),
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.post("/api/coupon")
def add_coupon():
    data = request.json

    if not data.get("code") or not data.get("discount"):
        return jsonify({"success": False, "error": "Missing fields"})

    conn = get_db_connection()
    conn.execute(
        "INSERT INTO coupons (business_id, code, discount, date) VALUES (?, ?, ?, ?)",
        (data["businessId"], data["code"], data["discount"], datetime.now().strftime("%Y-%m-%d")),
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.get("/api/captcha")
def get_captcha():
    num1 = secrets.randbelow(10)
    num2 = secrets.randbelow(10)
    session["captcha_answer"] = num1 + num2
    return jsonify({"question": f"What is {num1} + {num2}?"})


@app.post("/api/verify-captcha")
def verify_captcha():
    data = request.json
    if "answer" not in data:
        return jsonify({"success": False})

    try:
        user_ans = int(data["answer"])
        correct_ans = session.get("captcha_answer")
        if user_ans == correct_ans:
            return jsonify({"success": True})
    except ValueError:
        pass

    return jsonify({"success": False})


@app.post("/api/help")
def help_chat():
    data = request.json

    if not data or not data.get("message", "").strip():
        return jsonify({"reply": "Please type a question and I will do my best to help!"}), 400

    user_message = data["message"].strip()
    reply = get_help_response(user_message)
    return jsonify({"reply": reply})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
