-- ==============================================================================
-- Migration: 202611250004_fix_issued_invoices_persistence.sql
-- Description: Fix issued invoices persistence and reload:
--              1. Ensure pgcrypto extension is created in schema extensions.
--              2. Fix issue_invoice_atomic to invoke extensions.digest(convert_to(..., 'UTF8'), 'sha256')
--                 (resolving function digest(text, unknown) does not exist error).
--              3. Grant necessary table and RPC execution permissions to authenticated role.
--              4. Ensure idempotent RLS policies for SELECT, INSERT, UPDATE, DELETE.
-- Target: PostgreSQL 15+ / Supabase
-- ==============================================================================

-- 1. Ensure pgcrypto extension is installed in extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Replace public.issue_invoice_atomic with correct bytea conversion for digest
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

    -- SHA-256 uppercase digest using extensions.digest with bytea conversion
    v_hash := UPPER(encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex'));

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
    CASE WHEN p_payment_status = 'paid' THEN COALESCE(v_ts, clock_timestamp()) ELSE NULL END,
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

-- 3. Row Level Security (RLS) Policies
ALTER TABLE public.issued_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "issued_invoices_select" ON public.issued_invoices;
CREATE POLICY "issued_invoices_select"
  ON public.issued_invoices
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(issued_invoices.organization_id));

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
  USING (public.is_org_member(issued_invoices.organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "issued_invoices_delete" ON public.issued_invoices;
CREATE POLICY "issued_invoices_delete"
  ON public.issued_invoices
  FOR DELETE
  TO authenticated
  USING (public.is_org_member(issued_invoices.organization_id));

-- 4. Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.issued_invoices TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_invoice_atomic TO authenticated;
