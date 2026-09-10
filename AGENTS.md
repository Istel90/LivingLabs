# Working platform and verification rules

## Mandatory latest baseline — user confirmed 2026-09-07

**All future work must use this exact screen as the latest authoritative baseline:**
`http://127.0.0.1:4173/internal-tools/priority-management-area/flood?regionCode=41110`

The user explicitly stated that this is the latest platform and that everything must be based on it. This supersedes treating all priority-management-area routes as interchangeable reference screens.

- Inspect this flood screen first when assessing the current platform. Preserve its latest layout, interaction flow, and shared functionality as the baseline for feature work, data additions, fixes, and verification.
- Other hazards, including heatwave/WBGT, must follow this baseline. Their hazard-specific routes are implementation/test targets, not alternative authoritative versions. Do not substitute the heatwave route or a demo when the user refers to the latest platform.
- The shared implementation is `riskmap-core-main/src/lib/tools/PriorityManagementArea.svelte`; the baseline route is `riskmap-core-main/src/routes/priority-management-area/flood/+page.svelte`.
- `/internal-tools/climate-hazard-demo` and `/internal-tools/climate-hazard-lab` use a separate experimental implementation. Never present them as the user's platform or use their checks as evidence that the latest platform works. Use them only when explicitly asked to work on them.
- Verify shared changes in the exact flood baseline above, and additionally verify the affected hazard route. Heatwave/WBGT lives at `/internal-tools/priority-management-area/heatwave?regionCode=41110`; do not mix heatwave indicators into flood merely because flood is the baseline.
- Check the running browser, relevant data request, and served build. Source edits or separate component builds alone do not establish that the running platform has been updated.
- The local server serves `pages-dist`; build internal tools with `PAGES_BASE_PATH=/internal-tools` and copy into `pages-dist/internal-tools`. Confirm the owner of port 4173 before targeted restart and preserve other services.
- Do not introduce duplicate production screens for new features. Do not migrate to another screen/version or replace the authoritative baseline without an explicit user instruction.
- WBGT browser regression: `scripts/wbgt/verify-platform-browser.py` (Playwright and local Chrome).

This instruction does not authorize unrelated redesign or deletion of experimental pages.

## Saved alternative comparison checkpoint — 2026-09-10

Before modifying or reverting the saved-alternative comparison, read `docs/ALTERNATIVE_OVERLAP_2026-09-10.md`.
The pre-change source, served internal-tools build, and 11 Supabase draft rows are preserved in
`output/alternative-overlap-backup-20260910-140005/`, with SHA-256 hashes and targeted restore instructions.
Preserve earlier uncommitted work; do not use a repository-wide hard reset for this feature.
