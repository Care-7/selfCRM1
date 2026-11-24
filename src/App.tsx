import { useState } from 'react';
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
import { DashboardPage } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { InvoicesPage, type InvoicesTab } from './pages/InvoicesPage';
import { AccountingPage } from './pages/AccountingPage';
import { TaxesPage } from './pages/TaxesPage';

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('inicio');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('Todas las actividades');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('quarter');
  const [invoicesTab, setInvoicesTab] = useState<InvoicesTab>('emitidas');
  const [taxRegime, setTaxRegime] = useState<TaxRegime>('autonomo');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // In-memory stateful domain collections
  const [userProfile, setUserProfile] = useState<UserProfile>(INITIAL_USER_PROFILE);
  const [clients, setClients] = useState<Contact[]>(INITIAL_CLIENTS);
  const [suppliers, setSuppliers] = useState<Contact[]>(INITIAL_SUPPLIERS);
  const [issuedInvoices, setIssuedInvoices] = useState<IssuedInvoice[]>(INITIAL_ISSUED_INVOICES);
  const [receivedInvoices, setReceivedInvoices] = useState<ReceivedInvoice[]>(INITIAL_RECEIVED_INVOICES);

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

  // Subtle confirmation feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3400);
  };

  const defaultActivity: ActivityType =
    activityFilter === 'Todas las actividades' ? 'Contabilidad Comunidades' : activityFilter;

  const handleSaveContact = (saved: Contact, isNew: boolean) => {
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

  const handleSaveProfile = (next: UserProfile) => {
    setUserProfile(next);
    setTaxRegime(next.regime);
    showToast('Ajustes fiscales actualizados.');
  };

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
        userProfile={userProfile}
        onOpenSettings={() => setSettingsOpen(true)}
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
        issuedInvoices={issuedInvoices}
        receivedInvoices={receivedInvoices}
        onClose={() => setContactModal((prev) => ({ ...prev, open: false }))}
        onSave={handleSaveContact}
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
        profile={userProfile}
        onClose={() => setSettingsOpen(false)}
        onSaveProfile={handleSaveProfile}
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
