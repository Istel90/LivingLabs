-- Run only if rollback is required, after backing up ALL current rows and stopping saves.
-- Keep the new columns and sequence so post-deployment history is not lost.
BEGIN;
LOCK TABLE public.priority_area_sets IN ACCESS EXCLUSIVE MODE;
DROP TRIGGER IF EXISTS guard_priority_draft_write ON public.priority_area_sets;
ALTER TABLE public.priority_area_sets ALTER COLUMN lineage_id DROP NOT NULL;
-- Old UI understands archived, but does not understand deleted_at.
UPDATE public.priority_area_sets SET status='archived' WHERE status='draft' AND deleted_at IS NOT NULL;
DROP INDEX IF EXISTS public.priority_draft_one_successor;
DROP INDEX IF EXISTS public.priority_draft_version_unique;
REVOKE USAGE ON SEQUENCE public.priority_draft_number_seq FROM anon, authenticated;
COMMIT;
-- Restore served-internal-tools to pages-dist/internal-tools after this transaction.
-- Retain function, columns, sequence, history and newly saved rows for later recovery.
-- Migration history still records the forward change: re-enabling requires a new migration.
