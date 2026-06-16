"""
Database access for Localyze.

A thin wrapper around SQLite. The database is a single local file, so the app
runs fully offline and ships with no external database dependency. Three tables:
    reviews     community reviews and star ratings
    coupons     community-submitted deals/coupons
    businesses  per-zip cache of OpenStreetMap results
"""

import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "localyze.db")


def init_db() -> None:
    """Create the tables on first run if they don't already exist."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute(
        """CREATE TABLE IF NOT EXISTS reviews
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  business_id TEXT,
                  user TEXT,
                  rating INTEGER,
                  text TEXT,
                  date TEXT)"""
    )

    cursor.execute(
        """CREATE TABLE IF NOT EXISTS coupons
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  business_id TEXT,
                  code TEXT,
                  discount TEXT,
                  date TEXT)"""
    )

    # Cache table so we don't re-fetch the same zip code twice.
    cursor.execute(
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


def get_db_connection() -> sqlite3.Connection:
    """Open a connection with dict-like row access."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn
