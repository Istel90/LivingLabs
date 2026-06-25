# LivingLabs Data Flow Diagnosis

This note records the current data-flow state before moving workflow data to the Supabase model described in `livinglab_data_structure_v2.xlsx`.

## Tool Entry Points

| Tool | Current entry file | Main implementation |
| --- | --- | --- |
| Portal / tool hub | `src/app/App.tsx`, `src/app/routes.ts` | React router pages under `src/app/pages` |
| Priority management area tool | `src/app/pages/InternalToolGatewayPage.tsx`, `riskmap-core-main/src/routes/priority-management-area/*/+page.svelte` | `riskmap-core-main/src/lib/tools/PriorityManagementArea.svelte`, `riskmap-core-main/src/lib/maps/SelectedRegionMap.svelte` |
| Lead department support tool | `src/app/routes.ts` path `/lead-department-tool` | `src/app/pages/LeadDepartmentPrototypePage.tsx` |
| Responsible department support tool | `src/app/pages/InternalToolGatewayPage.tsx`, `riskmap-core-main/src/routes/responsible-department/+page.svelte` | `riskmap-core-main/src/lib/tools/ResponsibleDepartmentTool.svelte` |

## Current Supabase Usage

- `shared/services/platformHandoffs.js` stores handoff payloads in the compatibility table `platform_handoffs`.
- `src/app/components/Header.tsx` clears `platform_handoffs` through `clearPlatformHandoffs()`.
- The current table stores large payload snapshots. It should remain temporarily as a compatibility bridge, but the new source of truth should be normalized workflow tables.

## Current Local/Session Storage Usage To Migrate

These are business-data or handoff persistence points that should be migrated to Supabase workflow tables:

- `riskmap-core-main/src/lib/tools/PriorityManagementArea.svelte`
  - `livinglabs.priorityManagementHandoff`
  - `livinglabs.priorityManagementHandoff:recall`
  - `window.name` relay payloads
- `src/app/pages/LeadDepartmentPrototypePage.tsx`
  - `livinglabs.priorityManagementHandoff`
  - `livinglabs.responsibleDepartmentHandoff`
  - `livinglabs.priorityManagementHandoff:recall`
  - adaptation placement payloads stored by `adaptationPlacementStorageKey(...)`
  - `window.name` relay payloads
  - `BroadcastChannel` handoff relay
- `riskmap-core-main/src/lib/tools/ResponsibleDepartmentTool.svelte`
  - `livinglabs.responsibleDepartmentHandoff`
  - `window.name` relay payloads

Local/session storage may still be used for UI-only state such as collapsed panels, active tabs, filters, and map viewport.

## Current Proxy / Relay Usage

- Root Vite dev server proxies `/priority-handoff`, `/responsible-handoff`, `/responsible-review-response`, and `/vworld-data` to `127.0.0.1:5176`.
- Internal tools Vite dev server has the same proxy entries.
- `riskmap-core-main/scripts/vworld-data-proxy.mjs` still keeps JSON handoff stores under `.runtime-logs`.
- This proxy should remain available during transition for local development and VWorld API calls, but workflow data should move to Supabase tables.

## Priority Area Generation Points

- Risk/H/E/V analysis and alternatives are centered in `riskmap-core-main/src/lib/tools/PriorityManagementArea.svelte`.
- Map rendering, parcel candidate focus, and VWorld parcel hydration are centered in `riskmap-core-main/src/lib/maps/SelectedRegionMap.svelte`.
- The handoff payload is currently assembled in `PriorityManagementArea.svelte` near the `summarizeCandidateForHandoff(...)` and handoff functions.

## Receiving / Replying Points

- The lead department tool receives priority handoffs in `src/app/pages/LeadDepartmentPrototypePage.tsx`.
- The lead department tool sends responsible-department packages in the same file.
- The responsible department tool receives and replies in `riskmap-core-main/src/lib/tools/ResponsibleDepartmentTool.svelte`.

## Migration Strategy

1. Add normalized Supabase tables without deleting `platform_handoffs`.
2. Add a shared data service for normalized tables.
3. Convert priority management handoff creation to write:
   `priority_area_sets -> priority_area_options -> parcel_candidates -> candidate_parcels -> handoff_requests -> review_events`.
4. Convert lead department inbox to read `handoff_requests` and related normalized records.
5. Convert selected priority area, adaptation projects, placements, project review packages, and responsible-department replies.
6. Remove business data from local/session storage after each equivalent Supabase path is stable.

## Non-Goals For The First Pass

- Do not redesign the UI.
- Do not remove the compatibility `platform_handoffs` table yet.
- Do not alter the public `master` GitHub Pages demo until the `dev` branch flow is tested.
