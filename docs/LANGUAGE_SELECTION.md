# Language & Technology Selection

This document explains, in industry terms, why each language and framework was
chosen and how the choice reflects the needs of the project. It maps to the
rating sheet's **"Coding language selection"** row.

## Summary

| Layer | Language | Framework | Why |
| --- | --- | --- | --- |
| Frontend | **TypeScript** | React 18 + Next.js 14 | Type-safe, component-driven UI with rich animation and mapping ecosystem |
| Backend | **Python** | Flask | Fast to build a small REST API; first-class HTTP, JSON, and SQLite support in the standard library |
| Storage | **SQL** | SQLite | Zero-config embedded database that ships with the app and runs offline |

## Frontend — TypeScript, React, Next.js

The product is an **interactive interface** (per the topic's allowed formats),
so a component-based frontend framework is the natural fit.

- **React** gives us a declarative component model. The UI has many independent,
  stateful pieces — the globe, the map, the results panel, the business dialog,
  the help chat, the voice control — and React lets us compose them cleanly and
  keep their state isolated.
- **TypeScript** adds static typing on top of JavaScript. Our data has a clear
  shape (`Business`, `Review`, `LocationPayload` in `lib/types.ts`), and typing
  the API boundary catches mistakes at compile time instead of at the judges'
  table. This directly supports the rubric's emphasis on clean logic and
  "effective use of data types."
- **Next.js** provides production-grade tooling out of the box: a dev server with
  fast refresh, an optimized build, and a **rewrites proxy** that forwards
  `/api/*` to the Flask backend, avoiding CORS friction in development.
- **three.js** (WebGL) powers the rotating 3D globe, and **Leaflet** powers the
  interactive map — both are the de-facto open-source standards in their space,
  which keeps the "wow" hero affordable to build and maintain.

## Backend — Python with Flask

The backend's job is small and well-defined: take a zip code, call two
OpenStreetMap APIs, filter and enrich the results, and persist user reviews and
coupons.

- **Flask** is a minimal **micro-framework** — ideal for a focused REST API where
  a full framework (e.g. Django) would be overkill. Routes are explicit and easy
  for judges to read.
- **Python's standard library** covers nearly everything we need with no extra
  dependencies: `urllib` for outbound HTTP, `json` for parsing, `sqlite3` for
  storage, `re` for input validation, and `secrets` for cryptographically random
  CAPTCHA values. Fewer dependencies means a more reliable standalone solution.
- Python's readability makes the data-processing logic (chain filtering,
  category classification, rating aggregation) easy to follow and explain.

## Storage — SQLite

- **SQLite** is an **embedded, serverless** SQL database stored in a single file
  (`localyze.db`). There is nothing to install or configure, and it runs fully
  offline — which is essential given the rubric's "must run standalone" and
  unreliable-conference-internet warnings.
- It also doubles as a **cache**: once a zip's businesses are fetched, they are
  stored and served instantly on later searches without hitting the network.

## Trade-offs Considered

- A single-language stack (e.g. all-JavaScript with Node) was considered, but
  splitting concerns lets each language play to its strengths: TypeScript for a
  type-safe interactive UI, Python for concise data/IO logic.
- A hosted database (Postgres/MySQL) was rejected because it would break the
  standalone, offline-friendly requirement and add deployment complexity with no
  benefit at this scale.
