# Development Environment

This project keeps the public demo and active development separated by branch and by environment files.

## Branches

- `master`: public GitHub Pages demo. Keep this stable.
- `dev`: home/school development branch. Push work here while iterating.

Only merge `dev` into `master` when the public demo should be updated.

## Local API Keys

Each PC has its own `.env.local`.

- Home PC: use the home VWorld key.
- School PC: use the school VWorld key.
- GitHub Pages: use the external GitHub Pages VWorld key from GitHub Actions secrets.

Never commit `.env.local`.

Use these templates:

- Root portal: copy `.env.example` to `.env.local`.
- Internal tools: copy `riskmap-core-main/.env.example` to `riskmap-core-main/.env.local`.

Example home PC value:

```dotenv
VITE_VWORLD_API_KEY=753DDF3C-E1FB-310A-9CC5-86FB0C705976
```

If a VWorld key is registered to another service URL, update `VITE_VWORLD_DOMAIN` to match that registration.

## Current Local Ports

The current development setup still has separate local servers.

| Area | Command | URL |
| --- | --- | --- |
| Portal | `npm run dev:portal` | `http://127.0.0.1:5173` |
| Survey platform | `npm run dev:survey` | `http://127.0.0.1:5174` |
| Internal tools | `npm run dev:internal-tools` | `http://127.0.0.1:5175` |
| VWorld/data proxy | `npm --prefix riskmap-core-main run vworld:proxy -- --port=5176` | `http://127.0.0.1:5176` |

The next architecture task is to reduce this split and make the shared Supabase data model the source of truth.

## Data Ownership Rule

Use Supabase for workflow data:

- priority management packages
- alternatives
- candidates
- parcels
- adaptation projects
- adaptation placements
- handoff requests
- review events

Use local/session storage only for temporary UI state:

- collapsed panels
- active tab
- map viewport
- unsaved draft UI state

This keeps home PC, school PC, Chrome, and GitHub Pages from drifting apart.
