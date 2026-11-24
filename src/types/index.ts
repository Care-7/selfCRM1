export type ActivityType = 'Contabilidad Comunidades' | 'Actividad Artística';
export type ActivityFilter = 'Todas las actividades' | ActivityType;

export type PeriodFilter = 'month' | 'quarter' | 'year';

export type NavSection =
  | 'inicio'
  | 'clientes'
  | 'proveedores'
  | 'facturas'
  | 'contabilidad'
  | 'impuestos';

export type ContactKind = 'cliente' | 'proveedor';
export type ContactStatus = 'Activo' | 'Inactivo';

export type IvaRate = 21 | 10 | 4 | 0;
export type IrpfRate = 15 | 7 | 0;

export interface Contact {
  id: string;
  kind: ContactKind;
  name: string;
  nif: string;
  email: string;
  address: string;
  activity: ActivityType;
  defaultIva: IvaRate;
  defaultIrpf: IrpfRate;
  status: ContactStatus;
  /** Historical billed/spent before the active ledger window (in EUR) */
  historicalVolume: number;
  notes?: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export type IssuedInvoiceStatus = 'Cobrada' | 'Pendiente' | 'Borrador';

export interface IssuedInvoice {
  id: string;
  number: string;
  series: 'CC' | 'AR';
  clientId: string;
  clientName: string;
  clientNif: string;
  activity: ActivityType;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  lines: InvoiceLine[];
  ivaRate: 21 | 10 | 0;
  irpfRate: IrpfRate;
  status: IssuedInvoiceStatus;
  veriFactuLocked: boolean;
  veriFactuHash?: string;
  veriFactuTimestamp?: string;
}

export type ReceivedInvoiceStatus = 'Contabilizada' | 'Pendiente';

export interface ReceivedInvoice {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  supplierNif: string;
  activity: ActivityType;
  issueDate: string; // YYYY-MM-DD
  concept: string;
  pgcAccountCode: string;
  pgcAccountName: string;
  baseAmount: number;
  ivaRate: IvaRate;
  irpfRetainedRate?: IrpfRate; // For Mod. 111 (professional suppliers/rent)
  status: ReceivedInvoiceStatus;
  deductible: boolean;
}

export interface InvoiceTotals {
  baseImponible: number;
  ivaAmount: number;
  irpfAmount: number;
  total: number;
}

export interface DashboardKPIs {
  netRevenue: number;
  deductibleExpenses: number;
  netProfit: number;
  profitMarginPct: number;
  taxForecastTotal: number;
  ivaForecast: number;
  irpfForecast: number;
  previousNetRevenue: number;
  revenueTrendPct: number;
}

export interface MonthlyMetric {
  monthKey: string; // YYYY-MM
  label: string; // Jun, Jul...
  ingresos: number;
  gastos: number;
}

export interface JournalEntryLine {
  accountCode: string;
  accountName: string;
  debe: number;
  haber: number;
}

export interface JournalEntry {
  id: string;
  entryNumber: number;
  date: string;
  concept: string;
  sourceRef: string;
  sourceType: 'emitida' | 'recibida';
  activity: ActivityType;
  lines: JournalEntryLine[];
  totalDebe: number;
  totalHaber: number;
}

export interface BalanceLineItem {
  code: string;
  label: string;
  amount: number;
}

export interface BalanceSheet {
  activoNoCorriente: BalanceLineItem[];
  activoCorriente: BalanceLineItem[];
  totalActivoNoCorriente: number;
  totalActivoCorriente: number;
  totalActivo: number;
  patrimonioNeto: BalanceLineItem[];
  pasivoNoCorriente: BalanceLineItem[];
  pasivoCorriente: BalanceLineItem[];
  totalPatrimonioNeto: number;
  totalPasivoNoCorriente: number;
  totalPasivoCorriente: number;
  totalPasivoYPatrimonio: number;
  isBalanced: boolean;
}

export type RatioHealth = 'Óptimo' | 'Estable' | 'Atención';

export interface FinancialRatio {
  id: string;
  name: string;
  valueFormatted: string;
  rawValue: number;
  benchmark: string;
  health: RatioHealth;
  explanation: string;
}

export type TaxRegime = 'autonomo' | 'empresa';
export type QuarterOption = 'T1' | 'T2' | 'T3' | 'T4';

export interface TaxSummary {
  regime: TaxRegime;
  periodLabel: string;
  dueDateLabel: string;
  mod303: {
    baseRepercutida: number;
    cuotaRepercutida21: number;
    cuotaRepercutida10: number;
    cuotaRepercutidaTotal: number;
    baseSoportada: number;
    cuotaSoportada: number;
    resultado: number; // positive = a ingresar, negative = a compensar
  };
  mod130: {
    ingresosComputables: number;
    gastosDeducibles: number;
    rendimientoNeto: number;
    cuota20: number;
    retencionesSoportadas: number;
    resultado: number;
  };
  mod111: {
    baseRetenciones: number;
    perceptores: number;
    cuotaIngresar: number;
  };
  impuestoGeneral: {
    modelName: string;
    modelCode: string;
    baseImponibleAnual: number;
    tipoEfectivoPct: number;
    cuotaIntegra: number;
    pagosACuenta: number;
    cuotaDiferencial: number;
  };
}

export interface UserProfile {
  fullName: string;
  roleLabel: string;
  nif: string;
  email: string;
  address: string;
  regime: TaxRegime;
  veriFactuEnabled: boolean;
  avatarUrl: string;
}

export interface OcrSampleInvoice {
  id: string;
  fileName: string;
  fileSize: string;
  supplierName: string;
  supplierNif: string;
  number: string;
  issueDate: string;
  activity: ActivityType;
  concept: string;
  baseAmount: number;
  ivaRate: IvaRate;
  irpfRetainedRate: IrpfRate;
  pgcAccountCode: string;
  pgcAccountName: string;
}
