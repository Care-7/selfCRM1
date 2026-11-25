import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type {
  Organization,
  OrganizationMember,
  BusinessActivity,
  Profile,
  CreateTenantWorkspaceParams,
  Json,
} from '../types/database';

export interface TenantContextType {
  isConfigured: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  organization: Organization | null;
  activities: BusinessActivity[];
  loading: boolean;
  needsOnboarding: boolean;
  signOut: () => Promise<void>;
  refreshTenant: () => Promise<void>;
  createWorkspace: (params: CreateTenantWorkspaceParams) => Promise<string>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [activities, setActivities] = useState<BusinessActivity[]>([]);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(false);

  const loadTenantData = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured) return;

    try {
      // 1. Fetch user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData);
      }

      // 2. Fetch memberships
      const { data: members, error: membersError } = await supabase
        .from('organization_members')
        .select('*')
        .eq('user_id', userId)
        .limit(1);

      if (membersError) {
        console.error('Error fetching organization members:', membersError.message);
      }

      const memberList = (members as unknown as OrganizationMember[]) || [];
      if (memberList.length === 0) {
        setOrganization(null);
        setActivities([]);
        setNeedsOnboarding(true);
        return;
      }

      const activeOrgId = memberList[0].organization_id;

      // 3. Fetch Organization details
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', activeOrgId)
        .single();

      if (orgError || !orgData) {
        console.error('Error fetching organization details:', orgError?.message);
        setOrganization(null);
        setActivities([]);
        setNeedsOnboarding(true);
        return;
      }

      setOrganization(orgData);
      setNeedsOnboarding(false);

      // 4. Fetch Business Activities
      const { data: actsData, error: actsError } = await supabase
        .from('business_activities')
        .select('*')
        .eq('organization_id', activeOrgId)
        .order('name');

      if (actsError) {
        console.error('Error fetching business activities:', actsError.message);
      }

      setActivities(actsData || []);
    } catch (err) {
      console.error('Failed loading tenant data:', err);
    }
  }, []);

  const refreshTenant = useCallback(async () => {
    if (user?.id) {
      setLoading(true);
      await loadTenantData(user.id);
      setLoading(false);
    }
  }, [user?.id, loadTenantData]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          await loadTenantData(initialSession.user.id);
        } else {
          setUser(null);
          setOrganization(null);
          setActivities([]);
          setNeedsOnboarding(false);
        }
      } catch (err) {
        console.error('Supabase session initialization error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        if (!isMounted) return;

        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (nextSession?.user) {
          setLoading(true);
          await loadTenantData(nextSession.user.id);
          if (isMounted) setLoading(false);
        } else {
          setProfile(null);
          setOrganization(null);
          setActivities([]);
          setNeedsOnboarding(false);
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadTenantData]);

  const signOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setOrganization(null);
    setActivities([]);
    setNeedsOnboarding(false);
  };

  const createWorkspace = async (params: CreateTenantWorkspaceParams): Promise<string> => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase no está configurado en este entorno.');
    }

    const { data, error } = await (supabase.rpc as any)('create_tenant_workspace', {
      p_org_name: params.p_org_name,
      p_tax_id: params.p_tax_id ?? null,
      p_legal_form: params.p_legal_form ?? 'autonomo',
      p_tax_periodicity: params.p_tax_periodicity ?? 'quarterly',
      p_activities: params.p_activities ?? [],
    });

    if (error) {
      throw error;
    }

    const createdOrgId = data as string;

    // Refresh context with the new organization and activities
    if (user?.id) {
      await loadTenantData(user.id);
    }

    return createdOrgId;
  };

  return (
    <TenantContext.Provider
      value={{
        isConfigured: isSupabaseConfigured,
        user,
        session,
        profile,
        organization,
        activities,
        loading,
        needsOnboarding,
        signOut,
        refreshTenant,
        createWorkspace,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
