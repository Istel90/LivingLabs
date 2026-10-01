# Canopy download handoff — 2026-09-12

## October 1 run — resumed after requested break

September 30 was skipped as instructed. Recovered ten completed Seoul-priority
files today: 1074,1094–1098,1120–1123. Submitted the last four pending Seoul
tiles. Seoul: 12 VERIFIED / 4 READY / 0 PENDING of 16; no whole-city completion
claim yet. Remaining Gyeonggi priority group: 138 PENDING. Suwon and Incheon
remain completed with their separate local city TIFFs intact.
National stage: 87 VERIFIED, 2 EMPTY_BOUNDARY, 4 READY, 1,209 PENDING of 1,302.
No RUNNING at final snapshot and no FAILED/UNKNOWN/SUBMITTING/EMPTY_SOURCE.

Full national audit now covers 89 files: 3,165,239,569 target pixels,
one missingInside (the existing 0058 discrepancy), zero value255Inside,
710,057 exterior edge pixels. All ten new files have zero missingInside.
Downloaded national files total 731,305,419 bytes. Drive free 85.58 GiB;
D free 869.10 GiB. Restricted-mode warning still appears during this morning
run, before the previously documented October 1 16:00 KST monthly refresh.
No billing changes, deletions or duplicate submissions.

Administrative MD/CSV/JSON and the offline desktop status HTML were refreshed.
Ten Seoul files were recovered across a two-day interval including the skipped
run; that is not evidence of ten/day. At a crude five/day recovery rate the
remaining four suggest roughly one day, conditional on GEE completion and QA.
Check the final four at the next scheduled run, then perform Seoul-specific
boundary QA before reporting whole-city completion and moving on to Gyeonggi.
Recalculate Gyeonggi/nationwide forecasts after observing post-refresh throughput.

## Local status viewer — September 29

Desktop shortcut `C:/Users/User/Desktop/수관높이 다운로드 현황.lnk` launches
`.venv-gee/Scripts/pythonw.exe scripts/canopy_status_viewer.py` in this workspace.
It generates `output/canopy-admin-progress/status.html` and opens it in the
default browser. It reads local state/audit/admin reports only; no GEE access,
downloads, submissions or scheduler changes. Recent three days means today and
the previous two KST dates, using submittedAt/verifiedAt event timestamps rather
than historical queue snapshots. Reopening the shortcut rebuilds the page.
The page includes searchable administrative rows, source record timestamp,
storage, validation caveats and the September 30 skip / October 1 resume notice.
Rendering and the September 30 date-window logic were checked. Keep the workspace
and its virtual environment in place for the shortcut to work.

## User-requested one-day skip — September 30

On September 29 the user requested no download work tomorrow and automatic
resumption the day after. Automation 1m-gee now explicitly skips all queue
execution, recovery/downloads, new submissions/retries and audits on September
30, 2026 (Asia/Seoul), including --limit 0. Existing remote GEE jobs are retained.
Resume the normal Seoul-first workflow at October 1, 2026 09:00 KST and continue
the existing daily schedule. The automation remains active to resume without
another user action; September 30 is a skipped work cycle.

## September 29 run

Recovered all ten previous queued exports: national 0069–0076 and the first
two Seoul-priority tiles 1072,1073. Submitted ten further Seoul tiles, preserving
the Seoul → remaining Gyeonggi → rest priority. Seoul now has 2 VERIFIED,
10 READY and 4 PENDING of 16. The additional Gyeonggi-priority group remains
138 PENDING; portions of Gyeonggi also overlap the Seoul group. Suwon 6/6 and
Incheon 62 valid plus one empty-boundary tile remain completed and packaged.
National stage: 77 VERIFIED, 2 EMPTY_BOUNDARY, 10 READY, 1,213 PENDING of 1,302.
No RUNNING at final snapshot, no FAILED/UNKNOWN/SUBMITTING/EMPTY_SOURCE.

Audited all 79 downloaded national files: 2,239,840,525 target pixels,
one missingInside (the previously recorded 0058 issue), zero value255Inside,
627,024 exterior edge pixels. Today's ten downloads all have zero missingInside.
National files total 569,820,471 bytes. Drive free 85.73 GiB; D free 869.28 GiB.
Restricted-mode compute warning persists. No deletions or billing/tier changes.

All 255 administrative rows regenerated in the existing MD/CSV/JSON paths.
Today's ten recovered tiles are observed output, not a guaranteed daily rate.
Seoul's first two tiles were submitted yesterday and recovered today; a crude
2/day scenario for its 14 remaining tiles is about seven more days, but this
single-batch observation is not a reliable deadline. Re-estimate after further
Seoul completions and the October 1 16:00 KST monthly quota refresh rather
than treating restricted-mode throughput as permanent. Nationwide and Gyeonggi
completion dates remain unconfirmed. Preserve the unresolved 0058 pixel until
its source-versus-boundary cause is established.

## September 28 priority change — Seoul first

User requested capital-region-first downloads and continuous administrative
list updates. New submissions now follow Seoul (16 intersecting national tiles),
then remaining Gyeonggi (138 additional tiles), then the rest of Korea (1,148).
Tiles touching both Seoul and Gyeonggi belong to the Seoul priority group.
Suwon/Incheon remain completed; existing noncapital remote jobs are preserved.
Original national names, geometries and identifiers remain intact. Queue selection
waits for the earlier group's file recovery before advancing; region completion
still requires independent boundary QA. Offline checks confirmed the 16-tile
Seoul selection, Gyeonggi transition and unchanged existing tile records.

Reconciliation recovered two more previously submitted files (0067,0068), both
zero missingInside. National audit now covers 69 files: 1,998,255,824 target
pixels, the same unresolved single missing pixel in 0058, zero value255Inside,
492,825 exterior edge pixels; total files 490,706,882 bytes.

Seoul exports 1072 and 1073 successfully submitted: 2 READY / 14 PENDING of 16.
Overall: 67 VERIFIED, 2 EMPTY_BOUNDARY, 10 READY (8 existing + 2 Seoul),
1,223 PENDING; no unresolved FAILED/UNKNOWN/SUBMITTING/EMPTY_SOURCE.
Drive free 85.81 GiB; D free 869.35 GiB; restricted compute warning persists.
An initial custom GEE task-priority attempt was rejected with HTTP 400 because
custom priority requires a commercial project. Remote status UNKNOWN and zero
matching tasks confirmed no export was created; the rejected request was logged
in submissionRecovery and safely restored to PENDING before normal submission.
The final implementation changes local selection order only, without custom
remote priority or billing changes. Existing queued tasks may run before Seoul.

Queue runs now regenerate output/canopy-admin-progress/administrative-progress.md,
.csv and .json on exit, including partial failure, and before priority selection.
The report includes all 255 stored administrative features and a priority column.
Separate QA/state edits should be followed by scripts/canopy_admin_progress.py.
Automation 1m-gee was updated and confirmed ACTIVE, retaining daily 09:00 and
the same thread. Its prompt now explicitly requires Seoul → Gyeonggi → rest,
report regeneration each run, and tracking the existing single-pixel discrepancy.

## September 28 run

Reconciled existing exports and downloaded six outputs (0061–0066) today.
Four others (0057–0060) had been downloaded on September 23 according to
verifiedAt; they are not counted as today's downloads. Existing queue was
empty after recovery, so submitted ten new exports (0067–0076).
Final national snapshot: 65 VERIFIED, 2 EMPTY_BOUNDARY, 10 READY, 1,225 PENDING
out of 1,302 cells; no FAILED/UNKNOWN/SUBMITTING or EMPTY_SOURCE. File-level
VERIFIED does not imply complete boundary coverage. Suwon 6/6 and Incheon
62 valid + 1 zero-target-boundary cell of 63 remain QA-approved and packaged.

Audited all 67 downloaded national files: 1,991,759,117 target pixels,
**1 missingInside**, zero value255Inside, 468,742 exterior edge pixels.
Missing pixel belongs to previously downloaded 0058 at EPSG:5179
(919975.5, 1573657.5), longitude/latitude (126.6318965285, 34.1531049228).
Its 3x3 target mask is a one-pixel-wide horizontal boundary strip; neighboring
inside pixels are height zero, but this pixel is NoData. Boundary projection
versus original source masking remains unresolved: never fill it with zero
or declare nationwide QA complete. Details and neighborhood are preserved in
`.runtime-logs/canopy-national-missing-review.json`. All six files recovered
today have zero missingInside. Review this discrepancy on subsequent runs.

National downloads total 485,648,435 bytes. Drive free 85.81 GiB; D free
869.36 GiB. Restricted-mode compute warning persists; no billing/tier changes
or Drive deletions. Remote completion timestamps show 25 outputs over
September 17–24 (8 days), approximately 3.1/day while work was queued.
The 1,235 unfinished cells would take roughly 395 days at that sustained
rate (around late October 2027), strictly a throughput scenario, not a promised
date. The queue ran out after September 24, so September 25–27 zero outputs
must not be interpreted as pure compute speed. Actual finish remains uncertain
and should be recalculated after quota conditions and observed throughput change.

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
