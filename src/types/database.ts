/**
 * Database schema definitions for Supabase PostgreSQL tables and RPCs.
 * Aligned with migration 202611240001_multitenant_core.sql and ARCHITECTURE.md.
 */

export type LegalForm = 'autonomo' | 'sl' | 'other';
export type TaxPeriodicity = 'quarterly' | 'monthly';
export type OrganizationRole = 'owner' | 'admin' | 'accountant' | 'viewer';

export interface Profile {
  id: string; // UUID references auth.users(id)
  full_name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string; // UUID primary key
  name: string;
  tax_id: string | null;
  legal_form: LegalForm;
  tax_periodicity: TaxPeriodicity;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string; // UUID primary key
  organization_id: string; // UUID foreign key
  user_id: string; // UUID foreign key
  role: OrganizationRole;
  created_at: string;
}

export interface BusinessActivity {
  id: string; // UUID primary key
  organization_id: string; // UUID foreign key
  name: string;
  iae_code: string | null;
  invoice_series_prefix: string;
  default_vat_rate: number;
  default_irpf_rate: number;
  is_active: boolean;
  created_at: string;
}

/**
 * Payload input for initial activities seeded during onboarding.
 */
export interface CreateBusinessActivityInput {
  name: string;
  iae_code?: string | null;
  invoice_series_prefix: string;
  default_vat_rate?: number;
  default_irpf_rate?: number;
}

/**
 * Parameters for the atomic public.create_tenant_workspace RPC.
 */
export interface CreateTenantWorkspaceParams {
  p_org_name: string;
  p_tax_id?: string | null;
  p_legal_form?: LegalForm;
  p_tax_periodicity?: TaxPeriodicity;
  p_activities?: CreateBusinessActivityInput[];
}

export type CreateTenantWorkspaceResponse = string; // UUID of the newly created organization

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Supabase Generic Database Schema mapping for type-safe client usage.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      organizations: {
        Row: Organization;
        Insert: Partial<Organization> & { name: string };
        Update: Partial<Organization>;
        Relationships: [];
      };
      organization_members: {
        Row: OrganizationMember;
        Insert: Partial<OrganizationMember> & { organization_id: string; user_id: string };
        Update: Partial<OrganizationMember>;
        Relationships: [];
      };
      business_activities: {
        Row: BusinessActivity;
        Insert: Partial<BusinessActivity> & { organization_id: string; name: string; invoice_series_prefix: string };
        Update: Partial<BusinessActivity>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_org_member: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      is_org_admin: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      create_tenant_workspace: {
        Args: Record<string, unknown>;
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
