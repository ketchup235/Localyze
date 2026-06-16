# Attribution & Open-Source Material

Localyze is built on open-source software and open data. This document credits
every third-party component, its license, and how it is used — as required by
the FBLA Coding & Programming guidelines ("documentation of any copyrighted or
open-source material used").

## Data Source — OpenStreetMap

Business locations and categories come from **OpenStreetMap (OSM)** via two of
its public APIs:

- **Nominatim** — geocoding (zip code → latitude/longitude).
- **Overpass API** — querying nearby points of interest (shops, restaurants,
  services).

> Business location data © **OpenStreetMap contributors**.
> Licensed under the [Open Database License (ODbL) v1.0](https://opendatacommons.org/licenses/odbl/).
> Map data and copyright: https://www.openstreetmap.org/copyright

This credit is also displayed in the application UI on the map view, as the ODbL
requires attribution wherever the data is shown.

We use only public, rate-limited endpoints and send a descriptive `User-Agent`
(`Localyze/1.0`) per the Nominatim and Overpass usage policies.

## Frontend Libraries

| Library | Version | License | Used for |
| --- | --- | --- | --- |
| [Next.js](https://nextjs.org/) | 14.2.5 | MIT | React framework, routing, dev/build tooling |
| [React](https://react.dev/) / React DOM | 18.2.0 | MIT | UI component model |
| [three.js](https://threejs.org/) | 0.128.0 | MIT | 3D rotating globe in the hero |
| [Leaflet](https://leafletjs.com/) | 1.9.4 | BSD-2-Clause | Interactive slippy map |
| [Tailwind CSS](https://tailwindcss.com/) | 3.4 | MIT | Utility-first styling |
| [Radix UI — Dialog](https://www.radix-ui.com/) | 1.0.5 | MIT | Accessible modal primitives |
| [lucide-react](https://lucide.dev/) | 0.462.0 | ISC | Icons |
| [class-variance-authority](https://cva.style/) | 0.7.0 | Apache-2.0 | Component variant styling |
| [clsx](https://github.com/lukeed/clsx) | 2.1.1 | MIT | Conditional class names |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | 2.5.2 | MIT | Merge Tailwind class conflicts |

## Backend Libraries

| Library | Version | License | Used for |
| --- | --- | --- | --- |
| [Flask](https://flask.palletsprojects.com/) | 3.0.3 | BSD-3-Clause | HTTP API server |
| [Flask-CORS](https://flask-cors.readthedocs.io/) | 4.0.1 | MIT | Cross-origin requests from the dev frontend |
| Python standard library (`sqlite3`, `urllib`, `secrets`, `re`, `json`) | — | PSF | Storage, HTTP requests, CAPTCHA randomness, validation |

## Map Tiles

Map tiles are served by the OpenStreetMap standard tile layer, also © OpenStreetMap
contributors. Tile usage follows the
[OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).

## Our Own Work

All application code (the globe/map experience, results UI, review/coupon/CAPTCHA
flow, help assistant, voice control, and Flask API) was written by the team.
No copyrighted images, logos, or trademarks are bundled with the project.
