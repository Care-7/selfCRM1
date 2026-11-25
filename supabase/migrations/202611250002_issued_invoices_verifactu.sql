-- ==============================================================================
-- Migration: 202611250002_issued_invoices_verifactu.sql
-- Description: Core schema for Issued Invoices (Facturación Emitida),
--              VeriFactu cryptographic chaining (SHA-256), immutability triggers (RD 1007/2023),
--              atomic issuance RPC with race-condition prevention, and RLS policies.
-- Author: Senior Database & FinTech Architect (SelfSME)
-- Target: PostgreSQL 15+ / Supabase
-- ==============================================================================

-- 1. Enable pgcrypto for native cryptographic digest (SHA-256)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Table: public.issued_invoices
CREATE TABLE IF NOT EXISTS public.issued_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id UUID NULL REFERENCES public.business_activities(id) ON DELETE RESTRICT,
  client_id UUID NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL CHECK (document_type IN ('normal', 'rectificativa', 'proforma', 'albaran')),
  series TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  invoice_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NULL,
  issuer_snapshot JSONB NOT NULL,
  client_snapshot JSONB NOT NULL,
  lines JSONB NOT NULL,
  tax_base NUMERIC(12,2) NOT NULL,
  vat_total NUMERIC(12,2) NOT NULL,
  irpf_total NUMERIC(12,2) NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'overdue', 'cancelled')),
  paid_at TIMESTAMPTZ NULL,
  payment_method TEXT NULL,
  notes TEXT NULL,
  rectified_invoice_id UUID NULL REFERENCES public.issued_invoices(id) ON DELETE RESTRICT,
  rectification_reason TEXT NULL,
  converted_from_id UUID NULL REFERENCES public.issued_invoices(id) ON DELETE SET NULL,
  is_migrated BOOLEAN NOT NULL DEFAULT false,
  verifactu_locked BOOLEAN NOT NULL DEFAULT false,
  verifactu_hash TEXT NULL,
  verifactu_prev_hash TEXT NULL,
  verifactu_timestamp TIMESTAMPTZ NULL,
  verifactu_qr_url TEXT NULL,
  verifactu_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (verifactu_status IN ('not_applicable', 'generated', 'sent', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT issued_invoices_org_invoice_num_unique UNIQUE (organization_id, invoice_number),
  CONSTRAINT issued_invoices_org_series_seq_unique UNIQUE (organization_id, series, sequence_number)
);

-- Indexes for querying by organization, timeline, activity and client
CREATE INDEX IF NOT EXISTS idx_issued_invoices_org_date
  ON public.issued_invoices(organization_id, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_issued_invoices_activity_id
  ON public.issued_invoices(activity_id);

CREATE INDEX IF NOT EXISTS idx_issued_invoices_client_id
  ON public.issued_invoices(client_id);

CREATE INDEX IF NOT EXISTS idx_issued_invoices_chain
  ON public.issued_invoices(organization_id, verifactu_timestamp DESC, created_at DESC)
  WHERE verifactu_hash IS NOT NULL;

COMMENT ON TABLE public.issued_invoices IS 'Issued invoices, proformas, delivery notes and rectifications with VeriFactu SHA-256 chaining';

-- Trigger: auto-update updated_at timestamp
DROP TRIGGER IF EXISTS trg_issued_invoices_updated_at ON public.issued_invoices;
CREATE TRIGGER trg_issued_invoices_updated_at
  BEFORE UPDATE ON public.issued_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ==============================================================================
-- 3. VeriFactu Immutability Trigger (RD 1007/2023 Enforcement)
-- Strict prevention of physical deletion or modification of fiscal content
-- on any invoice marked with verifactu_locked = true (excluding migrated records).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.enforce_verifactu_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. DELETE restriction: VeriFactu locked invoices can NEVER be deleted physically
  IF TG_OP = 'DELETE' THEN
    IF OLD.verifactu_locked = true AND OLD.is_migrated = false THEN
      RAISE EXCEPTION 'VERIFACTU_IMMUTABLE: Las facturas emitidas sujetas a VeriFactu no pueden eliminarse. Emita una factura rectificativa.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- 2. UPDATE restriction: Fiscal content, numbering and hashes cannot be altered
  IF TG_OP = 'UPDATE' THEN
    IF OLD.verifactu_locked = true AND OLD.is_migrated = false THEN
      IF (OLD.invoice_number IS DISTINCT FROM NEW.invoice_number)
         OR (OLD.series IS DISTINCT FROM NEW.series)
         OR (OLD.sequence_number IS DISTINCT FROM NEW.sequence_number)
         OR (OLD.document_type IS DISTINCT FROM NEW.document_type)
         OR (OLD.issue_date IS DISTINCT FROM NEW.issue_date)
         OR (OLD.issuer_snapshot IS DISTINCT FROM NEW.issuer_snapshot)
         OR (OLD.client_snapshot IS DISTINCT FROM NEW.client_snapshot)
         OR (OLD.lines IS DISTINCT FROM NEW.lines)
         OR (OLD.tax_base IS DISTINCT FROM NEW.tax_base)
         OR (OLD.vat_total IS DISTINCT FROM NEW.vat_total)
         OR (OLD.irpf_total IS DISTINCT FROM NEW.irpf_total)
         OR (OLD.total_amount IS DISTINCT FROM NEW.total_amount)
         OR (OLD.verifactu_hash IS DISTINCT FROM NEW.verifactu_hash)
         OR (OLD.verifactu_prev_hash IS DISTINCT FROM NEW.verifactu_prev_hash)
         OR (OLD.verifactu_timestamp IS DISTINCT FROM NEW.verifactu_timestamp)
         OR (OLD.is_migrated IS DISTINCT FROM NEW.is_migrated)
         OR (OLD.verifactu_locked IS DISTINCT FROM NEW.verifactu_locked)
      THEN
        RAISE EXCEPTION 'VERIFACTU_IMMUTABLE: No está permitido modificar el contenido fiscal de una factura emitida sujeta a VeriFactu. Emita una factura rectificativa.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_verifactu_immutability ON public.issued_invoices;
CREATE TRIGGER trg_enforce_verifactu_immutability
  BEFORE UPDATE OR DELETE ON public.issued_invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verifactu_immutability();

-- ==============================================================================
-- 4. Atomic RPC: public.issue_invoice_atomic
-- Concurrency-safe invoice issuance with row locking on organizations,
-- sequential numbering without gaps, and cryptographic SHA-256 chaining.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.issue_invoice_atomic(
  p_organization_id UUID,
  p_series TEXT,
  p_document_type TEXT,
  p_issuer_snapshot JSONB,
  p_client_snapshot JSONB,
  p_lines JSONB,
  p_tax_base NUMERIC,
  p_vat_total NUMERIC,
  p_irpf_total NUMERIC,
  p_total_amount NUMERIC,
  p_activity_id UUID DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_issue_date DATE DEFAULT CURRENT_DATE,
  p_due_date DATE DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'pending',
  p_payment_method TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_rectified_invoice_id UUID DEFAULT NULL,
  p_rectification_reason TEXT DEFAULT NULL,
  p_converted_from_id UUID DEFAULT NULL,
  p_is_migrated BOOLEAN DEFAULT FALSE
)
RETURNS public.issued_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_next_seq INTEGER;
  v_invoice_number TEXT;
  v_prev_hash TEXT := '';
  v_ts TIMESTAMPTZ;
  v_ts_iso TEXT;
  v_date_str TEXT;
  v_type_code TEXT;
  v_issuer_nif TEXT;
  v_vat_str TEXT;
  v_total_str TEXT;
  v_canonical TEXT;
  v_hash TEXT := NULL;
  v_qr_url TEXT := NULL;
  v_locked BOOLEAN := false;
  v_status TEXT := 'not_applicable';
  v_result public.issued_invoices;
BEGIN
  -- 1. Security Check: Caller must belong to the active tenant organization
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Acceso denegado: no tiene permisos sobre la organización especificada.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock organization record to prevent concurrent numbering collisions
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

  -- 3. Calculate strictly sequential sequence number without gaps
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_next_seq
  FROM public.issued_invoices
  WHERE organization_id = p_organization_id
    AND series = p_series;

  v_invoice_number := p_series || '-' || LPAD(v_next_seq::text, 4, '0');

  -- 4. Cryptographic chaining for fiscal documents (normal & rectificativa)
  IF p_document_type IN ('normal', 'rectificativa') AND NOT p_is_migrated THEN
    -- Retrieve previous chained invoice's hash
    SELECT verifactu_hash
    INTO v_prev_hash
    FROM public.issued_invoices
    WHERE organization_id = p_organization_id
      AND verifactu_hash IS NOT NULL
    ORDER BY verifactu_timestamp DESC, created_at DESC
    LIMIT 1;

    v_prev_hash := COALESCE(v_prev_hash, '');
    v_ts := clock_timestamp();
    v_ts_iso := to_char(v_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    v_date_str := to_char(p_issue_date, 'DD-MM-YYYY');
    v_type_code := CASE WHEN p_document_type = 'rectificativa' THEN 'R1' ELSE 'F1' END;
    v_issuer_nif := UPPER(TRIM(COALESCE(p_issuer_snapshot->>'tax_id', '')));
    v_vat_str := trim(to_char(p_vat_total, 'FM999999999990.00'));
    v_total_str := trim(to_char(p_total_amount, 'FM999999999990.00'));

    -- VeriFactu canonical payload
    v_canonical := 'IDEmisorFactura=' || v_issuer_nif ||
                   '&NumSerieFactura=' || v_invoice_number ||
                   '&FechaExpedicionFactura=' || v_date_str ||
                   '&TipoFactura=' || v_type_code ||
                   '&CuotaTotal=' || v_vat_str ||
                   '&ImporteTotal=' || v_total_str ||
                   '&HuellaAnterior=' || v_prev_hash ||
                   '&FechaHoraHusoGenRegistro=' || v_ts_iso;

    -- SHA-256 uppercase digest
    v_hash := UPPER(encode(digest(v_canonical, 'sha256'), 'hex'));

    -- Official AEAT verification QR URL
    v_qr_url := 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/ZZ01.shtml?nif=' ||
                v_issuer_nif ||
                '&numserie=' || v_invoice_number ||
                '&fecha=' || v_date_str ||
                '&importe=' || v_total_str;

    v_locked := true;
    v_status := 'generated';
  ELSE
    -- Proformas, albaranes or migrated records do NOT generate VeriFactu chains
    v_ts := NULL;
    v_hash := NULL;
    v_prev_hash := NULL;
    v_qr_url := NULL;
    v_locked := false;
    v_status := 'not_applicable';
  END IF;

  -- 5. Insert invoice record
  INSERT INTO public.issued_invoices (
    organization_id,
    activity_id,
    client_id,
    document_type,
    series,
    sequence_number,
    invoice_number,
    issue_date,
    due_date,
    issuer_snapshot,
    client_snapshot,
    lines,
    tax_base,
    vat_total,
    irpf_total,
    total_amount,
    payment_status,
    paid_at,
    payment_method,
    notes,
    rectified_invoice_id,
    rectification_reason,
    converted_from_id,
    is_migrated,
    verifactu_locked,
    verifactu_hash,
    verifactu_prev_hash,
    verifactu_timestamp,
    verifactu_qr_url,
    verifactu_status
  ) VALUES (
    p_organization_id,
    p_activity_id,
    p_client_id,
    p_document_type,
    p_series,
    v_next_seq,
    v_invoice_number,
    p_issue_date,
    p_due_date,
    p_issuer_snapshot,
    p_client_snapshot,
    p_lines,
    p_tax_base,
    p_vat_total,
    p_irpf_total,
    p_total_amount,
    p_payment_status,
    CASE WHEN p_payment_status = 'paid' THEN now() ELSE NULL END,
    p_payment_method,
    p_notes,
    p_rectified_invoice_id,
    p_rectification_reason,
    p_converted_from_id,
    p_is_migrated,
    v_locked,
    v_hash,
    v_prev_hash,
    v_ts,
    v_qr_url,
    v_status
  ) RETURNING * INTO v_result;

  -- 6. If converting from proforma/albaran, mark source document as converted
  IF p_converted_from_id IS NOT NULL THEN
    UPDATE public.issued_invoices
    SET notes = COALESCE(notes, '') || ' [Convertida a factura ' || v_invoice_number || ']'
    WHERE id = p_converted_from_id
      AND organization_id = p_organization_id;
  END IF;

  RETURN v_result;
END;
$$;

-- ==============================================================================
-- 5. Row Level Security (RLS) Policies
-- ==============================================================================
ALTER TABLE public.issued_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "issued_invoices_select" ON public.issued_invoices;
CREATE POLICY "issued_invoices_select"
  ON public.issued_invoices
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "issued_invoices_insert" ON public.issued_invoices;
CREATE POLICY "issued_invoices_insert"
  ON public.issued_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "issued_invoices_update" ON public.issued_invoices;
CREATE POLICY "issued_invoices_update"
  ON public.issued_invoices
  FOR UPDATE
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "issued_invoices_delete" ON public.issued_invoices;
CREATE POLICY "issued_invoices_delete"
  ON public.issued_invoices
  FOR DELETE
  TO authenticated
  USING (public.is_org_member(organization_id));

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.issued_invoices TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_invoice_atomic TO authenticated;
