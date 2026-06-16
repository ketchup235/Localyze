"""
Localyze API.

A small Flask service that powers the Localyze frontend: it finds local
businesses for a zip code, stores community reviews and coupons, guards
submissions with a math CAPTCHA, and answers help-assistant questions.

This module is intentionally thin - it only wires HTTP routes. The real work
lives in focused modules:
    db.py          SQLite schema and connections
    services.py    geocoding, Overpass lookup, seed fallback, help matcher
    validation.py  request validation
    seed_data.py   offline business dataset
"""

from datetime import datetime

import secrets

from flask import Flask, jsonify, request, session
from flask_cors import CORS

from db import get_db_connection, init_db
from services import (
    business_exists,
    get_help_response,
    load_businesses,
    resolve_zip_location,
)
from validation import is_valid_zip, validate_coupon, validate_review

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)
CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000"])

init_db()


@app.get("/")
def health():
    return jsonify({"status": "ok"})


@app.get("/api/location")
def get_location():
    zip_code = request.args.get("zip", "").strip()

    if not is_valid_zip(zip_code):
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
    Main data route. Returns businesses for a zip plus a `source` flag
    ("cache" | "live" | "seed" | "none") so the UI can show an offline badge
    when the bundled seed dataset is used.
    """
    zip_code = request.args.get("zip", "").strip()

    if not is_valid_zip(zip_code):
        return jsonify({"businesses": [], "source": "none"})

    conn = get_db_connection()
    try:
        businesses, source = load_businesses(conn, zip_code)
    finally:
        conn.close()

    return jsonify({"businesses": businesses, "source": source})


@app.get("/api/reviews/<id>")
def get_reviews(id):
    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT user, rating, text, date FROM reviews WHERE business_id = ? ORDER BY id DESC",
            (id,),
        ).fetchall()
    finally:
        conn.close()

    return jsonify([dict(row) for row in rows])


@app.post("/api/review")
def add_review():
    cleaned, error = validate_review(request.get_json(silent=True))
    if error:
        return jsonify({"success": False, "error": error}), 400

    conn = get_db_connection()
    try:
        if not business_exists(conn, cleaned["businessId"]):
            return jsonify(
                {"success": False, "error": "That business could not be found. Please reopen it and try again."}
            ), 404
        conn.execute(
            "INSERT INTO reviews (business_id, user, rating, text, date) VALUES (?, ?, ?, ?, ?)",
            (
                cleaned["businessId"],
                cleaned["user"],
                cleaned["rating"],
                cleaned["text"],
                datetime.now().strftime("%Y-%m-%d"),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return jsonify({"success": True})


@app.post("/api/coupon")
def add_coupon():
    cleaned, error = validate_coupon(request.get_json(silent=True))
    if error:
        return jsonify({"success": False, "error": error}), 400

    conn = get_db_connection()
    try:
        if not business_exists(conn, cleaned["businessId"]):
            return jsonify(
                {"success": False, "error": "That business could not be found. Please reopen it and try again."}
            ), 404
        conn.execute(
            "INSERT INTO coupons (business_id, code, discount, date) VALUES (?, ?, ?, ?)",
            (
                cleaned["businessId"],
                cleaned["code"],
                cleaned["discount"],
                datetime.now().strftime("%Y-%m-%d"),
            ),
        )
        conn.commit()
    finally:
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
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or "answer" not in data:
        return jsonify({"success": False})

    try:
        user_ans = int(data["answer"])
    except (TypeError, ValueError):
        return jsonify({"success": False})

    if user_ans == session.get("captcha_answer"):
        return jsonify({"success": True})
    return jsonify({"success": False})


@app.post("/api/help")
def help_chat():
    data = request.get_json(silent=True)

    if not isinstance(data, dict) or not data.get("message", "").strip():
        return jsonify({"reply": "Please type a question and I will do my best to help!"}), 400

    return jsonify({"reply": get_help_response(data["message"].strip())})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
