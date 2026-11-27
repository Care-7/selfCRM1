-- ==============================================================================
-- Migration: 202611270002_create_manual_journal_entries.sql
-- Description: Create manual_journal_entries table for double-entry manual and
--              imported journal entries with strict multi-tenant RLS isolation.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.manual_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.business_activities(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  document_number TEXT NULL,
  concept TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'imported')),
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for date queries scoped by organization
CREATE INDEX IF NOT EXISTS idx_manual_journal_entries_org_date
  ON public.manual_journal_entries(organization_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_manual_journal_entries_activity
  ON public.manual_journal_entries(activity_id);

-- Automatic timestamp trigger
DROP TRIGGER IF EXISTS trg_manual_journal_entries_updated_at ON public.manual_journal_entries;
CREATE TRIGGER trg_manual_journal_entries_updated_at
  BEFORE UPDATE ON public.manual_journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_timestamp();

-- Row Level Security (RLS)
ALTER TABLE public.manual_journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manual_journal_entries_select" ON public.manual_journal_entries;
CREATE POLICY "manual_journal_entries_select"
  ON public.manual_journal_entries
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(manual_journal_entries.organization_id));

DROP POLICY IF EXISTS "manual_journal_entries_insert" ON public.manual_journal_entries;
CREATE POLICY "manual_journal_entries_insert"
  ON public.manual_journal_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "manual_journal_entries_update" ON public.manual_journal_entries;
CREATE POLICY "manual_journal_entries_update"
  ON public.manual_journal_entries
  FOR UPDATE
  TO authenticated
  USING (public.is_org_member(manual_journal_entries.organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "manual_journal_entries_delete" ON public.manual_journal_entries;
CREATE POLICY "manual_journal_entries_delete"
  ON public.manual_journal_entries
  FOR DELETE
  TO authenticated
  USING (public.is_org_member(manual_journal_entries.organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.manual_journal_entries TO authenticated;
