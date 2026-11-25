-- ==============================================================================
-- Migration: 202611250005_received_invoices_storage.sql
-- Description: Real persistence of Received Invoices / Expenses (received_invoices)
--              with strict multi-tenant RLS isolation, IAE activity assignment,
--              deductibility percentages for VAT and IRPF/IS, and private
--              Supabase Storage bucket for receipt documents (PDF/images).
-- Target: PostgreSQL 15+ / Supabase
-- ==============================================================================

-- 1. Table: public.received_invoices
CREATE TABLE IF NOT EXISTS public.received_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.business_activities(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_snapshot JSONB NOT NULL,
  supplier_invoice_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  accounting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expense_category TEXT NOT NULL DEFAULT '629',
  description TEXT NULL,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  tax_base NUMERIC(12,2) NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 21.00,
  vat_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  irpf_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  irpf_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12,2) NOT NULL,
  deductible_vat_pct NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (deductible_vat_pct >= 0 AND deductible_vat_pct <= 100),
  deductible_expense_pct NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (deductible_expense_pct >= 0 AND deductible_expense_pct <= 100),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'overdue')),
  paid_at TIMESTAMPTZ NULL,
  payment_method TEXT NULL,
  attachment_path TEXT NULL,
  attachment_name TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index: Prevent duplicate invoice number for the same supplier in the same organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_received_invoices_unique_supplier_num
  ON public.received_invoices(organization_id, supplier_id, supplier_invoice_number)
  WHERE supplier_id IS NOT NULL;

-- Query optimization indices
CREATE INDEX IF NOT EXISTS idx_received_invoices_org_date
  ON public.received_invoices(organization_id, accounting_date DESC);

CREATE INDEX IF NOT EXISTS idx_received_invoices_activity
  ON public.received_invoices(activity_id);

CREATE INDEX IF NOT EXISTS idx_received_invoices_supplier
  ON public.received_invoices(supplier_id);

-- Helper trigger function to maintain updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Automatic timestamp trigger
DROP TRIGGER IF EXISTS trg_received_invoices_updated_at ON public.received_invoices;
CREATE TRIGGER trg_received_invoices_updated_at
  BEFORE UPDATE ON public.received_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_timestamp();

-- 2. Row Level Security (RLS) on public.received_invoices
ALTER TABLE public.received_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "received_invoices_select" ON public.received_invoices;
CREATE POLICY "received_invoices_select"
  ON public.received_invoices
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(received_invoices.organization_id));

DROP POLICY IF EXISTS "received_invoices_insert" ON public.received_invoices;
CREATE POLICY "received_invoices_insert"
  ON public.received_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "received_invoices_update" ON public.received_invoices;
CREATE POLICY "received_invoices_update"
  ON public.received_invoices
  FOR UPDATE
  TO authenticated
  USING (public.is_org_member(received_invoices.organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "received_invoices_delete" ON public.received_invoices;
CREATE POLICY "received_invoices_delete"
  ON public.received_invoices
  FOR DELETE
  TO authenticated
  USING (public.is_org_member(received_invoices.organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.received_invoices TO authenticated;

-- 3. Private Storage Bucket for Expense Invoices (expense-documents)
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-documents', 'expense-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: only members of {organization_id} can read, upload and delete in their folder
DROP POLICY IF EXISTS "expense_documents_select" ON storage.objects;
CREATE POLICY "expense_documents_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'expense-documents'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "expense_documents_insert" ON storage.objects;
CREATE POLICY "expense_documents_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expense-documents'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "expense_documents_update" ON storage.objects;
CREATE POLICY "expense_documents_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'expense-documents'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'expense-documents'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "expense_documents_delete" ON storage.objects;
CREATE POLICY "expense_documents_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'expense-documents'
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );
