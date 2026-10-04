# Real-Time-Solar-Generation-Data-API 

A MySQL-backed Level 2 REST API for real-time and historical rooftop-solar generation data. It implements the NB6007CEM coursework domain while keeping operational reads, analytical reads, device writes, and jurisdiction-scoped human reads distinct.

## Architecture at a glance

```text
SLSEA user -- user JWT --> read-only hierarchy, assets, history, summaries
Meter device -- device JWT --> POST one installation's readings only
                                  |
Express API --> authorization --> MySQL
                                  |
                                  +-- append-only generation_readings
```

The domain hierarchy is `Province -> District -> GridSubstation -> SolarInstallation -> GenerationReading`. The meter identifier and credential hash are installation attributes; there is intentionally no separate device entity. Readings are immutable rows, while “latest reading” is derived at query time.

## Run locally

Requirements: Node.js 20+ and MySQL 8.4+.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm start
```

The local configuration connects to `slsea_solar` on `localhost:3306`. Set `DB_USER` and `DB_PASSWORD` in the Git-ignored `.env` when the local MySQL server requires authentication.

Alternatively, with Docker installed:

```bash
docker compose up --build
```

The Docker image migrates and idempotently seeds the database on startup. Local URLs:

- API health: `http://localhost:3000/health`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI document: `http://localhost:3000/openapi.yaml`
- Authentication and cURL examples: [API_USAGE_GUIDE.md](./API_USAGE_GUIDE.md)

Seed credentials are demonstrations and must be replaced for a real deployment:

- National user: `national@slsea.gov.lk` / `NationalDemo!2026`
- Device: `SL-MTR-00001` / `MeterDemo!2026`

Province users use `<province-code>@slsea.gov.lk`; district users use `<district-code>@slsea.gov.lk`. Their seed password is the same national demo password.

## Resource design

| Taxonomy | Example | Purpose |
|---|---|---|
| Collection | `GET /api/v1/provinces` | Visible top-level jurisdictions |
| Scoped collection | `GET /api/v1/districts/{id}/substations` | Children meaningful beneath a parent |
| Atomic | `GET /api/v1/readings/{id}` | One addressable resource |
| Composite | `GET /api/v1/installations/{id}/overview` | Installation, hierarchy, latest reading, history metadata |
| Derived | `GET /api/v1/installations/{id}/latest-reading` | Operational last-known value |
| Processing | `GET /api/v1/districts/{id}/generation-summary` | District-wide current power and today's energy |

The complete contract, including response schemas and authentication, is in [openapi.yaml](./openapi.yaml).

## Authentication and authorization

Obtain a user token with `POST /api/v1/auth/user-token`. National users can read all data; province and district users are restricted inside the SQL query, rather than filtering an already-loaded result. An inaccessible resource returns `404`, which avoids confirming that out-of-scope identifiers exist.

Obtain a device token with `POST /api/v1/auth/device-token`. Its JWT contains the installation identifier. The ingestion route rejects a valid device token used against any other installation.

Generation readings support `POST`, `GET`, and collection search. They intentionally do not support update or delete because the domain defines the time series as append-only. A duplicate installation/timestamp is a conflict, not an update.

## HTTP behaviour

- Successful ingestion returns `201 Created` and `Location`.
- Retrievable representations emit `ETag` and `Last-Modified`.
- Matching `If-None-Match` or `If-Modified-Since` returns `304` with no body.
- A stale `If-Match` validator returns `412 Precondition Failed`.
- Unsupported request media types return `415`; unavailable representations return `406`.
- Errors consistently contain `code`, `message`, `details`, and `requestId`.
- History accepts `page`, `pageSize`, `sort`, `from`, and `to`.
- The global history search also accepts `provinceId`, `districtId`, and `substationId`.
- Pagination responses contain total count plus self, next, and previous links.

## Verification

```bash
npm run check
npm run test:coverage
```

The automated suite verifies the error contract, content negotiation, validation, conditional GET behaviour, pagination links, authorization-scope construction, and required OpenAPI coverage. Database smoke testing can be performed after seeding using [scripts/smoke.js](./scripts/smoke.js).

## Deployment

`render.yaml` and `Dockerfile` provide a repeatable HTTPS deployment path. Render does not provision MySQL through this blueprint, so `DATABASE_URL` must point to an externally managed MySQL 8.4 service. Set a strong `JWT_SECRET` and restrict `CORS_ORIGINS` before deployment. After deployment, verify `/health`, `/docs`, authentication, every jurisdiction level, history pagination, a conditional request, cross-jurisdiction denial, and device ingestion.

Do not submit a deployment until the live database is seeded and the URLs remain reachable from a private browser window.

## Design records

- [Architecture decisions](./docs/ARCHITECTURE_DECISIONS.md)
- [Requirements traceability](./docs/REQUIREMENTS_TRACEABILITY.md)
- [Security model](./docs/SECURITY_MODEL.md)
- [Viva guide](./docs/VIVA_GUIDE.md)
- [AI assistance log](./docs/AI_DISCLOSURE_LOG.md)
- [Vercel deployment guide](./docs/VERCEL_DEPLOYMENT.md)

These notes are engineering documentation, not report prose. The assessed report must be written in the student's own words under the coursework declaration.
