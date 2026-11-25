import { useState, useEffect } from 'react';
import { Menu, CheckCircle2 } from 'lucide-react';
import type {
  ActivityFilter,
  ActivityType,
  Contact,
  ContactKind,
  IssuedInvoice,
  IssuedInvoiceStatus,
  NavSection,
  PeriodFilter,
  ReceivedInvoice,
  TaxRegime,
  UserProfile,
} from './types';
import {
  INITIAL_CLIENTS,
  INITIAL_ISSUED_INVOICES,
  INITIAL_RECEIVED_INVOICES,
  INITIAL_SUPPLIERS,
  INITIAL_USER_PROFILE,
  REFERENCE_DATE,
} from './data/mockData';
import { getNextInvoiceNumber } from './utils/finance';
import { Sidebar } from './components/Sidebar';
import { ContactSlideOver } from './components/ContactSlideOver';
import { InvoiceEditorModal } from './components/InvoiceEditorModal';
import { AiExpenseModal } from './components/AiExpenseModal';
import { SettingsModal } from './components/SettingsModal';
import { MigrationWizardModal } from './components/MigrationWizardModal';
import { DashboardPage } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { InvoicesPage, type InvoicesTab } from './pages/InvoicesPage';
import { AccountingPage } from './pages/AccountingPage';
import { TaxesPage } from './pages/TaxesPage';
import { TenantProvider, useTenant } from './context/TenantContext';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { Loader2 } from 'lucide-react';
import {
  listClients,
  createClient,
  updateClient,
  deleteClient,
  archiveClient,
} from './services/clientsService';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  archiveSupplier,
} from './services/suppliersService';
import {
  clientRowToContact,
  supplierRowToContact,
} from './services/contactMappers';

function MainApp() {
  const {
    isConfigured,
    session,
    loading,
    needsOnboarding,
    organization,
    activities,
    profile,
    signOut,
  } = useTenant();

  const [activeSection, setActiveSection] = useState<NavSection>('inicio');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('Todas las actividades');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('quarter');
  const [invoicesTab, setInvoicesTab] = useState<InvoicesTab>('emitidas');
  const [taxRegime, setTaxRegime] = useState<TaxRegime>('autonomo');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isDemo = !isConfigured;

  // In-memory stateful domain collections (Strictly empty in live mode)
  const [userProfile, setUserProfile] = useState<UserProfile>(INITIAL_USER_PROFILE);
  const [clients, setClients] = useState<Contact[]>(() => (isDemo ? INITIAL_CLIENTS : []));
  const [suppliers, setSuppliers] = useState<Contact[]>(() => (isDemo ? INITIAL_SUPPLIERS : []));
  const [issuedInvoices, setIssuedInvoices] = useState<IssuedInvoice[]>(() => (isDemo ? INITIAL_ISSUED_INVOICES : []));
  const [receivedInvoices, setReceivedInvoices] = useState<ReceivedInvoice[]>(() => (isDemo ? INITIAL_RECEIVED_INVOICES : []));

  // Reset in-memory state on sign-out / session loss in live mode
  useEffect(() => {
    if (isConfigured && !session) {
      setClients([]);
      setSuppliers([]);
      setIssuedInvoices([]);
      setReceivedInvoices([]);
    }
  }, [isConfigured, session]);

  // Slide-over & modal state
  const [contactModal, setContactModal] = useState<{
    open: boolean;
    kind: ContactKind;
    contact: Contact | null;
  }>({ open: false, kind: 'cliente', contact: null });

  const [invoiceModal, setInvoiceModal] = useState<{
    open: boolean;
    invoice: IssuedInvoice | null;
  }>({ open: false, invoice: null });

  const [aiExpenseOpen, setAiExpenseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);

  // Subtle loading state for Supabase contacts
  const [isContactsLoading, setIsContactsLoading] = useState(false);

  // Subtle confirmation feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3400);
  };

  // Load real clients and suppliers from Supabase when organization is active
  useEffect(() => {
    if (isConfigured && session && organization?.id) {
      let isMounted = true;
      setIsContactsLoading(true);

      Promise.all([
        listClients(organization.id),
        listSuppliers(organization.id),
      ])
        .then(([clientsRows, suppliersRows]) => {
          if (!isMounted) return;
          setClients(clientsRows.map((r) => clientRowToContact(r, activities)));
          setSuppliers(suppliersRows.map((r) => supplierRowToContact(r, activities)));
        })
        .catch((err) => {
          console.error('Error al sincronizar contactos:', err);
          showToast('No se pudieron sincronizar los contactos de Supabase.');
        })
        .finally(() => {
          if (isMounted) setIsContactsLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isConfigured, session, organization?.id, activities]);

  const defaultActivity: ActivityType =
    activityFilter === 'Todas las actividades'
      ? (activities[0]?.name || (isDemo ? 'Contabilidad Comunidades' : 'Actividad Principal'))
      : activityFilter;

  const handleSaveContact = async (saved: Contact, isNew: boolean) => {
    if (isConfigured && session && organization?.id) {
      const targetActivityId =
        saved.activityId ||
        activities.find((a) => a.name === saved.activity)?.id ||
        null;

      if (saved.kind === 'cliente') {
        if (isNew) {
          const row = await createClient({
            organization_id: organization.id,
            activity_id: targetActivityId,
            name: saved.name,
            tax_id: saved.nif,
            email: saved.email || null,
            phone: saved.phone || null,
            address: saved.address || null,
            default_vat_rate: saved.defaultIva,
            default_irpf_rate: saved.defaultIrpf,
            notes: saved.notes || null,
            is_active: saved.status === 'Activo',
          });
          const mapped = clientRowToContact(row, activities);
          setClients((prev) => [mapped, ...prev]);
          showToast(`Cliente «${mapped.name}» registrado en Supabase.`);
        } else {
          const row = await updateClient(saved.id, organization.id, {
            activity_id: targetActivityId,
            name: saved.name,
            tax_id: saved.nif,
            email: saved.email || null,
            phone: saved.phone || null,
            address: saved.address || null,
            default_vat_rate: saved.defaultIva,
            default_irpf_rate: saved.defaultIrpf,
            notes: saved.notes || null,
            is_active: saved.status === 'Activo',
          });
          const mapped = clientRowToContact(row, activities);
          setClients((prev) => prev.map((c) => (c.id === saved.id ? mapped : c)));
          showToast(`Ficha de «${mapped.name}» actualizada en Supabase.`);
        }
      } else {
        if (isNew) {
          const row = await createSupplier({
            organization_id: organization.id,
            activity_id: targetActivityId,
            name: saved.name,
            tax_id: saved.nif,
            email: saved.email || null,
            phone: saved.phone || null,
            address: saved.address || null,
            default_vat_rate: saved.defaultIva,
            default_irpf_rate: saved.defaultIrpf,
            notes: saved.notes || null,
            is_active: saved.status === 'Activo',
          });
          const mapped = supplierRowToContact(row, activities);
          setSuppliers((prev) => [mapped, ...prev]);
          showToast(`Proveedor «${mapped.name}» registrado en Supabase.`);
        } else {
          const row = await updateSupplier(saved.id, organization.id, {
            activity_id: targetActivityId,
            name: saved.name,
            tax_id: saved.nif,
            email: saved.email || null,
            phone: saved.phone || null,
            address: saved.address || null,
            default_vat_rate: saved.defaultIva,
            default_irpf_rate: saved.defaultIrpf,
            notes: saved.notes || null,
            is_active: saved.status === 'Activo',
          });
          const mapped = supplierRowToContact(row, activities);
          setSuppliers((prev) => prev.map((s) => (s.id === saved.id ? mapped : s)));
          showToast(`Ficha de «${mapped.name}» actualizada en Supabase.`);
        }
      }
    } else {
      // In-memory demo mode fallback
      if (saved.kind === 'cliente') {
        setClients((prev) =>
          isNew ? [saved, ...prev] : prev.map((c) => (c.id === saved.id ? saved : c))
        );
        showToast(isNew ? `Cliente «${saved.name}» añadido.` : `Ficha de «${saved.name}» actualizada.`);
      } else {
        setSuppliers((prev) =>
          isNew ? [saved, ...prev] : prev.map((s) => (s.id === saved.id ? saved : s))
        );
        showToast(isNew ? `Proveedor «${saved.name}» añadido.` : `Ficha de «${saved.name}» actualizada.`);
      }
    }
  };

  const handleDeleteContact = async (id: string, kind: ContactKind) => {
    if (isConfigured && session && organization?.id) {
      if (kind === 'cliente') {
        await deleteClient(id, organization.id);
        setClients((prev) => prev.filter((c) => c.id !== id));
        showToast('Cliente eliminado de Supabase.');
      } else {
        await deleteSupplier(id, organization.id);
        setSuppliers((prev) => prev.filter((s) => s.id !== id));
        showToast('Proveedor eliminado de Supabase.');
      }
    } else {
      if (kind === 'cliente') {
        setClients((prev) => prev.filter((c) => c.id !== id));
      } else {
        setSuppliers((prev) => prev.filter((s) => s.id !== id));
      }
      showToast('Registro eliminado de la memoria.');
    }
  };

  const handleArchiveContact = async (id: string, kind: ContactKind, nextActive: boolean) => {
    const statusLabel = nextActive ? 'Activo' : 'Inactivo';
    if (isConfigured && session && organization?.id) {
      if (kind === 'cliente') {
        const updated = await archiveClient(id, organization.id, nextActive);
        const mapped = clientRowToContact(updated, activities);
        setClients((prev) => prev.map((c) => (c.id === id ? mapped : c)));
      } else {
        const updated = await archiveSupplier(id, organization.id, nextActive);
        const mapped = supplierRowToContact(updated, activities);
        setSuppliers((prev) => prev.map((s) => (s.id === id ? mapped : s)));
      }
    } else {
      if (kind === 'cliente') {
        setClients((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: statusLabel } : c))
        );
      } else {
        setSuppliers((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: statusLabel } : s))
        );
      }
    }
    showToast(nextActive ? 'Contacto reactivado.' : 'Contacto archivado.');
  };

  const handleSaveInvoice = (saved: IssuedInvoice, isNew: boolean) => {
    setIssuedInvoices((prev) =>
      isNew ? [saved, ...prev] : prev.map((inv) => (inv.id === saved.id ? saved : inv))
    );
    showToast(
      saved.veriFactuLocked
        ? `Factura ${saved.number} emitida, sellada en VeriFactu y contabilizada.`
        : `Borrador ${saved.number} guardado.`
    );
  };

  const handleMarkInvoicePaid = (invoiceId: string) => {
    setIssuedInvoices((prev) =>
      prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: 'Cobrada' } : inv))
    );
    showToast('Cobro registrado correctamente.');
  };

  const handleConvertDocumentToInvoice = (doc: IssuedInvoice) => {
    const numInfo = getNextInvoiceNumber(issuedInvoices, doc.activity, 'normal');

    const newInvoice: IssuedInvoice = {
      id: `inv-${Date.now()}`,
      number: numInfo.number,
      series: numInfo.series,
      documentType: 'normal',
      clientId: doc.clientId,
      clientName: doc.clientName,
      clientNif: doc.clientNif,
      activity: doc.activity,
      issueDate: REFERENCE_DATE,
      dueDate: doc.dueDate || '2026-12-24',
      lines: doc.lines.map((l, idx) => ({
        ...l,
        id: `line-${Date.now()}-${idx}`,
      })),
      ivaRate: doc.ivaRate,
      irpfRate: doc.irpfRate,
      status: 'Borrador',
      veriFactuLocked: false,
    };

    const updatedStatus: IssuedInvoiceStatus =
      doc.documentType === 'albaran' ? 'Facturado' : 'Convertida';

    setIssuedInvoices((prev) => [
      newInvoice,
      ...prev.map((inv) =>
        inv.id === doc.id
          ? {
              ...inv,
              status: updatedStatus,
              convertedToInvoiceId: newInvoice.id,
            }
          : inv
      ),
    ]);

    if (doc.documentType === 'albaran') {
      showToast(`Albarán ${doc.number} facturado. Se ha creado el borrador ${newInvoice.number}.`);
    } else {
      showToast(`Proforma ${doc.number} convertida. Se ha creado el borrador ${newInvoice.number}.`);
    }
  };

  const handleSaveReceivedExpense = (expense: ReceivedInvoice) => {
    setReceivedInvoices((prev) => [expense, ...prev]);
    showToast(`Gasto ${expense.number} contabilizado en el Libro Diario.`);
  };

  const handleImportClients = (newClients: Contact[]) => {
    setClients((prev) => [...newClients, ...prev]);
    showToast(`${newClients.length} clientes importados correctamente.`);
  };

  const handleImportSuppliers = (newSuppliers: Contact[]) => {
    setSuppliers((prev) => [...newSuppliers, ...prev]);
    showToast(`${newSuppliers.length} proveedores importados correctamente.`);
  };

  const handleImportInvoices = (newInvoices: IssuedInvoice[]) => {
    setIssuedInvoices((prev) => [...newInvoices, ...prev]);
    showToast(`${newInvoices.length} facturas históricas importadas correctamente.`);
  };

  const handleSaveProfile = (next: UserProfile) => {
    setUserProfile(next);
    setTaxRegime(next.regime);
    showToast('Ajustes fiscales actualizados.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#0071E3] mb-3" />
        <p className="text-[13px] text-[#6E6E73] font-medium">Cargando espacio de trabajo...</p>
      </div>
    );
  }

  if (isConfigured && !session) {
    return <AuthPage />;
  }

  if (isConfigured && session && needsOnboarding) {
    return <OnboardingPage />;
  }

  const handleSignOut = async () => {
    setClients([]);
    setSuppliers([]);
    setIssuedInvoices([]);
    setReceivedInvoices([]);
    await signOut();
  };

  const effectiveUserProfile: UserProfile = {
    fullName: organization?.name || profile?.full_name || (isDemo ? userProfile.fullName : 'Mi Empresa'),
    nif: organization?.tax_id || (isDemo ? userProfile.nif : ''),
    roleLabel: organization?.legal_form === 'sl' ? 'Sociedad Limitada' : 'Autónomo',
    email: profile?.email || session?.user?.email || (isDemo ? userProfile.email : ''),
    address: isDemo ? userProfile.address : '',
    regime: organization?.legal_form === 'sl' ? 'empresa' : 'autonomo',
    veriFactuEnabled: userProfile.veriFactuEnabled,
    avatarUrl: undefined,
  };

  const activityOptions: ActivityFilter[] = [
    'Todas las actividades',
    ...(activities.length > 0
      ? activities.map((a) => a.name as ActivityFilter)
      : ['Contabilidad Comunidades', 'Actividad Artística']),
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]">
      {/* Mobile Header (< lg) — kept compact (56px, well under 15% mobile viewport cap) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-[#FBFBFD]/90 backdrop-blur-md px-4 border-b border-black/[0.05] lg:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menú de navegación"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#1D1D1F] hover:bg-black/[0.05]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-[16px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
          SelfSME
        </span>
        <button
          type="button"
          onClick={() => setInvoiceModal({ open: true, invoice: null })}
          className="rounded-xl bg-[#0071E3] px-3 py-1.5 text-[12px] font-medium text-white"
        >
          + Factura
        </button>
      </header>

      {/* Fixed Sidebar */}
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        activityFilter={activityFilter}
        onChangeActivity={setActivityFilter}
        activityOptions={activityOptions}
        userProfile={effectiveUserProfile}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenMigration={() => setMigrationModalOpen(true)}
        onSignOut={isConfigured && session ? handleSignOut : undefined}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Canvas */}
      <main className="lg:pl-[264px]">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
          {activeSection === 'inicio' && (
            <DashboardPage
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              activityFilter={activityFilter}
              period={periodFilter}
              onChangePeriod={setPeriodFilter}
              taxRegime={taxRegime}
              onNavigate={setActiveSection}
              onSelectInvoice={(invoice) => setInvoiceModal({ open: true, invoice })}
              onNewInvoice={() => setInvoiceModal({ open: true, invoice: null })}
            />
          )}

          {activeSection === 'clientes' && (
            <ContactsPage
              kind="cliente"
              contacts={clients}
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              globalActivityFilter={activityFilter}
              activityOptions={activityOptions}
              isLoading={isContactsLoading}
              onOpenContact={(contact) =>
                setContactModal({ open: true, kind: 'cliente', contact })
              }
              onCreateContact={() =>
                setContactModal({ open: true, kind: 'cliente', contact: null })
              }
            />
          )}

          {activeSection === 'proveedores' && (
            <ContactsPage
              kind="proveedor"
              contacts={suppliers}
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              globalActivityFilter={activityFilter}
              activityOptions={activityOptions}
              isLoading={isContactsLoading}
              onOpenContact={(contact) =>
                setContactModal({ open: true, kind: 'proveedor', contact })
              }
              onCreateContact={() =>
                setContactModal({ open: true, kind: 'proveedor', contact: null })
              }
            />
          )}

          {activeSection === 'facturas' && (
            <InvoicesPage
              activeTab={invoicesTab}
              onChangeTab={setInvoicesTab}
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              activityFilter={activityFilter}
              onOpenNewInvoice={() => setInvoiceModal({ open: true, invoice: null })}
              onSelectIssuedInvoice={(invoice) => setInvoiceModal({ open: true, invoice })}
              onOpenAiExpenseModal={() => setAiExpenseOpen(true)}
              onConvertToInvoice={handleConvertDocumentToInvoice}
            />
          )}

          {activeSection === 'contabilidad' && (
            <AccountingPage
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              activityFilter={activityFilter}
            />
          )}

          {activeSection === 'impuestos' && (
            <TaxesPage
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              activityFilter={activityFilter}
              regime={taxRegime}
              onChangeRegime={setTaxRegime}
            />
          )}
        </div>
      </main>

      {/* Interactive Modals & Slide-overs */}
      <ContactSlideOver
        isOpen={contactModal.open}
        kind={contactModal.kind}
        contact={contactModal.contact}
        defaultActivity={defaultActivity}
        availableActivities={activities.map((a) => ({ id: a.id, name: a.name }))}
        issuedInvoices={issuedInvoices}
        receivedInvoices={receivedInvoices}
        onClose={() => setContactModal((prev) => ({ ...prev, open: false }))}
        onSave={handleSaveContact}
        onDelete={handleDeleteContact}
        onArchive={handleArchiveContact}
      />

      <InvoiceEditorModal
        isOpen={invoiceModal.open}
        invoice={invoiceModal.invoice}
        clients={clients}
        allIssuedInvoices={issuedInvoices}
        defaultActivity={defaultActivity}
        onClose={() => setInvoiceModal({ open: false, invoice: null })}
        onSaveInvoice={handleSaveInvoice}
        onMarkPaid={handleMarkInvoicePaid}
        onConvertToInvoice={handleConvertDocumentToInvoice}
      />

      <AiExpenseModal
        isOpen={aiExpenseOpen}
        suppliers={suppliers}
        onClose={() => setAiExpenseOpen(false)}
        onSaveExpense={handleSaveReceivedExpense}
      />

      <SettingsModal
        isOpen={settingsOpen}
        profile={effectiveUserProfile}
        onClose={() => setSettingsOpen(false)}
        onSaveProfile={handleSaveProfile}
        onOpenMigration={() => setMigrationModalOpen(true)}
      />

      <MigrationWizardModal
        isOpen={migrationModalOpen}
        onClose={() => setMigrationModalOpen(false)}
        onImportClients={handleImportClients}
        onImportSuppliers={handleImportSuppliers}
        onImportInvoices={handleImportInvoices}
        onNavigateSection={setActiveSection}
      />

      {/* Quiet Toast Feedback */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl bg-[#1D1D1F] px-4 py-3 text-[13px] font-medium text-white shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
          <CheckCircle2 className="h-4 w-4 text-[#34C759] shrink-0" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <TenantProvider>
      <MainApp />
    </TenantProvider>
  );
}
