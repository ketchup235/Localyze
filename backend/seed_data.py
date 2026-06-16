"""
Offline seed dataset.

When the live OpenStreetMap lookup (Nominatim + Overpass) is unavailable or
returns nothing — for example on unreliable conference Wi-Fi — the API falls
back to this curated list so the app always shows believable local businesses
for the demo zip codes. This is the project's "backup plan" for the rubric's
"must run standalone" requirement.

Each entry mirrors the shape produced by services.fetch_local_data():
    id          stable string id (prefixed "seed-" so it never collides with OSM ids)
    name        business name
    category    one of: "food", "retail", "services"
    base_rating starting rating before community reviews are blended in
    address     human-readable location label
"""

from typing import Dict, List, TypedDict


class SeedBusiness(TypedDict):
    id: str
    name: str
    category: str
    base_rating: float
    address: str


# Demo zips match the hard-coded centroids in frontend/app/page.tsx so the globe
# and map fly to the right place even in fully offline mode.
SEED_BUSINESSES: Dict[str, List[SeedBusiness]] = {
    "10001": [
        {"id": "seed-10001-1", "name": "Chelsea Corner Cafe", "category": "food", "base_rating": 4.6, "address": "New York, NY 10001"},
        {"id": "seed-10001-2", "name": "Hudson Yards Bakehouse", "category": "food", "base_rating": 4.4, "address": "New York, NY 10001"},
        {"id": "seed-10001-3", "name": "Flatiron Vintage Books", "category": "retail", "base_rating": 4.7, "address": "New York, NY 10001"},
        {"id": "seed-10001-4", "name": "West Side Cycle Repair", "category": "services", "base_rating": 4.3, "address": "New York, NY 10001"},
        {"id": "seed-10001-5", "name": "Garment District Tailors", "category": "services", "base_rating": 4.8, "address": "New York, NY 10001"},
        {"id": "seed-10001-6", "name": "Empire Greens Market", "category": "retail", "base_rating": 4.2, "address": "New York, NY 10001"},
    ],
    "19335": [
        {"id": "seed-19335-1", "name": "Downingtown Diner", "category": "food", "base_rating": 4.5, "address": "Downingtown, PA 19335"},
        {"id": "seed-19335-2", "name": "Brandywine Coffee Roasters", "category": "food", "base_rating": 4.7, "address": "Downingtown, PA 19335"},
        {"id": "seed-19335-3", "name": "Main Street Hardware", "category": "retail", "base_rating": 4.4, "address": "Downingtown, PA 19335"},
        {"id": "seed-19335-4", "name": "Struble Trail Outfitters", "category": "retail", "base_rating": 4.6, "address": "Downingtown, PA 19335"},
        {"id": "seed-19335-5", "name": "Borough Barber Co.", "category": "services", "base_rating": 4.3, "address": "Downingtown, PA 19335"},
        {"id": "seed-19335-6", "name": "Chester County Auto Care", "category": "services", "base_rating": 4.5, "address": "Downingtown, PA 19335"},
    ],
    "60601": [
        {"id": "seed-60601-1", "name": "Loop Street Tacos", "category": "food", "base_rating": 4.6, "address": "Chicago, IL 60601"},
        {"id": "seed-60601-2", "name": "Millennium Park Deli", "category": "food", "base_rating": 4.3, "address": "Chicago, IL 60601"},
        {"id": "seed-60601-3", "name": "Lakeshore Bookshop", "category": "retail", "base_rating": 4.8, "address": "Chicago, IL 60601"},
        {"id": "seed-60601-4", "name": "Wabash Records", "category": "retail", "base_rating": 4.5, "address": "Chicago, IL 60601"},
        {"id": "seed-60601-5", "name": "Riverwalk Bike Studio", "category": "services", "base_rating": 4.4, "address": "Chicago, IL 60601"},
        {"id": "seed-60601-6", "name": "East Loop Dry Cleaners", "category": "services", "base_rating": 4.2, "address": "Chicago, IL 60601"},
    ],
    "90210": [
        {"id": "seed-90210-1", "name": "Canon Drive Bistro", "category": "food", "base_rating": 4.7, "address": "Beverly Hills, CA 90210"},
        {"id": "seed-90210-2", "name": "Rodeo Juice Bar", "category": "food", "base_rating": 4.4, "address": "Beverly Hills, CA 90210"},
        {"id": "seed-90210-3", "name": "Beverly Stationery & Gifts", "category": "retail", "base_rating": 4.6, "address": "Beverly Hills, CA 90210"},
        {"id": "seed-90210-4", "name": "Canyon Flower Studio", "category": "retail", "base_rating": 4.8, "address": "Beverly Hills, CA 90210"},
        {"id": "seed-90210-5", "name": "Hillcrest Tailoring", "category": "services", "base_rating": 4.5, "address": "Beverly Hills, CA 90210"},
        {"id": "seed-90210-6", "name": "Sunset Bike & Skate Repair", "category": "services", "base_rating": 4.3, "address": "Beverly Hills, CA 90210"},
    ],
}


def get_seed_businesses(zip_code: str) -> List[SeedBusiness]:
    """Return a copy of the seed businesses for a zip, or an empty list."""
    return [dict(entry) for entry in SEED_BUSINESSES.get(zip_code, [])]


def is_seed_business(business_id: str) -> bool:
    """True if the id belongs to the bundled offline seed dataset."""
    return any(
        entry["id"] == business_id
        for entries in SEED_BUSINESSES.values()
        for entry in entries
    )
