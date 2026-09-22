# Canopy download handoff — 2026-09-12

## September 22 run

Restricted-mode warning persists. Collected six additional national outputs
(0051–0056). With only three existing READY tasks left, submitted seven new
exports (0060–0066) to keep the backlog around ten rather than the 50/day cap.
Final national snapshot: 55 VERIFIED, 2 EMPTY_BOUNDARY, 10 READY, 1,235 PENDING;
no RUNNING in that snapshot, no FAILED/UNKNOWN/SUBMITTING or unresolved empty
source. Suwon/Incheon and packaged city products remain completed.

Audited all 57 downloaded outputs: 1,875,427,182 target pixels, zero missing
inside, zero 255, 322,937 exterior edge pixels. National download total is
434,917,310 bytes. Free Drive 85.86 GiB, D 870.78 GiB. Recent daily completion
counts vary (4, 2, 1, 1, 5, 6); no fixed nationwide date is defensible while
restricted compute persists. Reconcile current tasks and refill modestly based
on observed completion rate, without duplicate submissions or tier changes.

## September 21 run

Restricted compute warning remains. Collected five additional national tiles
(0046–0050), including the first export using district-prefiltered clipping.
Current state: 49 VERIFIED, 2 EMPTY_BOUNDARY, 9 READY, 1,242 PENDING; no RUNNING
in final snapshot and no reported failure or unresolved empty source. No new
submissions while existing queue remains under restricted compute. Suwon/Incheon
and city bundle unchanged.

All 51 downloaded national files audited: 1,874,029,021 target pixel centers,
zero missing inside, zero 255, 308,748 exterior edge pixels. The first optimized
export (0050) also has zero missing inside at the actual 1m grid. National files
total 422,963,139 bytes. Free Drive 85.87 GiB; D 870.79 GiB. Recent daily added
completions were 4, 2, 1, 1, 5; do not extrapolate a fixed nationwide finish date
from the submission cap. Reconcile remaining tasks before refilling the queue.

## September 20 run

Restricted compute warning persists. Collected one additional national tile
(0045). Current national state: 44 VERIFIED, 2 EMPTY_BOUNDARY, 14 READY,
1,242 PENDING, zero RUNNING in the final snapshot; no FAILED/UNKNOWN/SUBMITTING
or unresolved EMPTY_SOURCE. No new submissions while the queue is backlogged.
Suwon/Incheon and their combined city ZIP remain complete and unchanged.

Full audit of 46 downloaded outputs found 1,864,216,581 target pixel centers,
zero missing inside, zero 255, and 279,667 exterior edge pixels. National files
total 411,271,320 bytes. Drive free 85.88 GiB; D free 870.80 GiB. Observed new
completions over recent daily runs: 4, 2, 1, 1. Current restricted throughput
does not support the previous mid-October forecast; keep completion date
unconfirmed and continue checking existing tasks without duplicate submissions.

## September 19 run

EE restricted-mode warning persists. Downloaded and verified two additional
national tiles (0043–0044). National: 43 VERIFIED, 2 EMPTY_BOUNDARY,
1 RUNNING, 14 READY, 1,242 PENDING; no reported failures. No new tasks submitted
while the existing 15-task backlog remains. Completed Suwon/Incheon and the
city ZIP remain unchanged.

Audit covers all 45 downloaded national files: 1,859,737,358 target pixels,
zero missing inside, zero 255, 273,564 exterior edge pixels. Download total
408,338,400 bytes. Free storage: Drive 85.88 GiB, D 870.81 GiB.
Only two new completions were observed since the previous daily run; a fixed
completion date is not supported while compute throttling and queued tasks
persist. Continue reconciliation and coverage checks without duplicate exports.

## September 18 run

Restricted-mode warning persists. Collected 4 additional national tiles (0039–0042).
National status: 41 VERIFIED, 2 audited EMPTY_BOUNDARY, 17 READY, 1,242 PENDING;
no RUNNING task in the final snapshot and no reported FAILED task. No new exports
submitted today because the existing queue remains backlogged under compute limits.
Suwon and Incheon remain complete with city bundle preserved.

Audit now covers all 43 downloaded national outputs: 1,854,533,620 target pixels,
zero missing inside, zero 255, and 265,816 exterior edge pixels. Total national
download size including the two retained empty-boundary files is 403,078,320 bytes.
Drive free 85.89 GiB, D free 870.81 GiB. Four new completions over this observation
interval are insufficient to justify the former 50/day throughput assumption;
do not repeat a firm mid-October deadline while restricted mode persists.
Continue reconciling existing tasks before deciding on any new submissions.

## September 17 run — restricted compute mode

Live EE API warning: noncommercial compute quota exceeded; project is in
restricted mode. This is not Drive storage exhaustion. Evidence and official
documentation saved in `.runtime-logs/canopy-quota-observation.json`.
No billing, registration, tier, account, or project changes were made. Existing
tasks continue; today added only 10 new tasks due reduced throughput.

National: 37 nonempty downloads verified, 2 empty files audited as zero target
pixel centers and reclassified EMPTY_BOUNDARY; 1 running and 20 ready after
today's 10 submissions; 1,242 unsubmitted. Full-file audit of the 39 downloaded
outputs found 1,842,061,832 target pixels, zero missing inside, zero 255, and
233,278 exterior edge pixels. Total downloaded national bytes: 392,114,855.
Do not approve national completion yet. Existing mid-October estimate needs
reassessment under restricted compute mode; 50/day is a submission cap, not
observed completion throughput.

New exports prefilter districts by a padded tile bounding box before passing
whole geometries to EE. No simplification or deletion of island polygons.
Upcoming 10 tile masks compared with all 241 districts at 10m and matched:
`.runtime-logs/canopy-prefilter-validation.json`. Final exported data remain 1m
and still require per-pixel boundary QA. Existing jobs were not cancelled.

## September 16 run

Incheon completed relative to the supplied administrative boundary: all 63
planned outputs collected, with 62 nonempty VERIFIED and one audited
EMPTY_BOUNDARY. Total 240,128,618 bytes. Full audit found 1,070,161,918 target
pixel centers, zero missing inside, zero value-255 pixels, and 612,817 exterior
edge pixels. The latter are retained and documented, not counted as target area.
Ganghwa and Ongjin polygons are included. An independent Korea Tourism
Organization coordinate for Daecheongdo (124.7026483977, 37.8254350630;
https://data.visitkorea.or.kr/page/128012) maps to tile 0055 with value 11;
evidence is `.runtime-logs/canopy-incheon-island-spotcheck.json`.
This checks the supplied coastline/administrative geometry, not a certification
of every recent reclamation or cadastral change. `qaApprovedStages` includes
both suwon and incheon. National first batch launched with --limit 50; inspect
live state for actual tile count and submission success.

National plan contains 1,302 cells. First batch process submits sequentially and
can take substantially longer per submission than city batches due to national
geometry payload. Do not mistake SUBMITTING for READY or launch a competing
queue while the lock is held. The persisted task id makes uncertain submissions
reconcilable. At 50 actual completions/day the remaining work is about 27 batch
days plus final collection/QA; mid-October is conditional, not measured national
throughput yet. If upload overhead persists, prefilter clipping features by each
tile's bounds while retaining the exact intersecting feature geometry; avoid
simplification that would discard small islands.

## September 15 run

Incheon first 50 outputs downloaded (176,013,199 bytes including one empty tile).
49 files have valid pixels. `chm_v1_incheon_0042` has zero valid pixels AND zero
pixel centers in the supplied administrative boundary at 1m. It is retained as
`EMPTY_BOUNDARY`, not counted as valid canopy data or source missing coverage.
Evidence: `.runtime-logs/canopy-incheon-audit.json` (50/63 tiles audited).
Audited target pixels: 820,250,605; missing inside: 0; value 255: 0;
extra valid edge pixels: 514,649. The remaining 13 exports were submitted today.
Check their live state rather than treating submission as completion.

Queue now records `EMPTY_SOURCE` without stopping collection of subsequent files.
Only a documented boundary audit can reclassify this to `EMPTY_BOUNDARY`.
Both types remain in audit output. Only VERIFIED and audited EMPTY_BOUNDARY
allow a stage to reach its separate QA gate; unresolved EMPTY_SOURCE blocks
advancement. Use `scripts/canopy_audit.py --stage incheon` after final downloads.
Do not approve Incheon until full 63-tile coverage and island scope are checked.

## Update after September 13 scheduled run (continued September 14)

Suwon corrected outputs: all 6 downloaded and checksum/grid/NoData verified.
`canopy_audit.py` found 120,974,336 pixel centers within the supplied boundary,
zero missing pixels inside, zero value-255 pixels, and heights 0–39.
Total corrected file size: 28,776,734 bytes (28.8 MB). There are 37,632 valid
pixels immediately outside the independently rasterized boundary (0.0311% of
boundary area); preserve this edge discrepancy in coverage reporting.
`qaApprovedStages` now includes `suwon`.

Read provider-owned v1 TIFF header directly; saved evidence is
`.runtime-logs/canopy-provider-metadata.json`: UNITS=METERS, UInt8, scale 1,
offset 0, no declared NoData in that sample. This confirms units, but does not
justify reclassifying 255 in other regions. Suwon contains no 255.

Incheon plan has 63 grid cells. Existing boundary includes Ganghwa (28710)
and Ongjin (28720). GEE rejected degenerate rings with fewer than three distinct
vertices. Boundary construction now removes only these zero-area rings and
records original coordinates in `.runtime-logs/canopy-incheon-boundary-cleaning.json`;
source boundaries remain unchanged. Older district names are not evidence of
current district structure; inspect island coverage before final completion.
The next-stage `--limit 50` batch was launched; consult state for live counts.

Priority: Suwon, Incheon including islands, then remaining South Korea.
Destination: `D:/LivingLabsData/canopy-height`. Do not delete Drive copies without authorization.

## Commands

Use the approved `.venv-gee/Scripts/python.exe scripts/canopy_queue.py --limit 0`
to reconcile tasks and download completed files. `--limit N` submits at most N new
tiles, subject to storage, 50 outstanding tasks, and 50 submissions per Korean day.
Current Suwon plan contains six 10 km grid cells.

Run `.venv-gee/Scripts/python.exe scripts/canopy_audit.py` to inspect downloaded
Suwon coverage against `public/data/suwon-boundary.geojson`.
State is `.runtime-logs/canopy-queue.json`; audit is
`.runtime-logs/canopy-suwon-audit.json`.

## Correction on September 12

The first pilot was downloaded with an export NoData tag but without explicitly
filling masked pixels. It contained zero-filled exterior pixels. This is NOT an
acceptable mask verification. Its original file is retained, its record is in
`superseded`, and original state is backed up in
`.runtime-logs/canopy-queue-before-explicit-nodata-20260912.json`.
All six Suwon exports were submitted with `_maskfix` suffix and explicit
`unmask(-9999, sameFootprint=False)`. Only these corrected files count towards
completion. Google documents this pattern at
https://developers.google.com/earth-engine/apidocs/export-image-todrive .

## Interpretation and completion gates

Source: `projects/sat-io/open-datasets/facebook/meta-canopy-height` (2024 v1,
not the newer DINOv3 v2). Preserve raw `cover_code` values as Int16; -9999 is
the exported EE mask. Do not arbitrarily map 255 to zero or silently remove it.
The initial pilot contained values 0–25 and no 255; this does not establish
the meaning of 255 across the full source. Provider background:
https://datasets.wri.org/datasets/meta-tree-canopy-height . Original v1 TIFF
metadata reproduced in https://github.com/facebookresearch/HighResCanopyHeight/issues/7
states UNITS=METERS, but a provider-owned TIFF metadata check would be stronger.

`VERIFIED` means checksum, grid, NoData tag, and nonempty raster passed. It does
not mean all administrative area pixels are covered or all encoding questions
are resolved. Before advancing from Suwon to Incheon, inspect coverage/values
and record `suwon` in `qaApprovedStages` only when supported by evidence. The
queue now enforces this transition gate. Similarly approve Incheon before
national expansion. Audit the old local administrative boundary's island
coverage before declaring Incheon/national complete.

Initial calendar targets (Suwon Sep 13–14, Incheon Sep 15–18, nationwide Oct 10–24)
were planning allowances, not measured throughput predictions. Update them using
actual completion timestamps, sizes and the actual grid counts; do not infer
daily completed throughput from the submission ceiling.
