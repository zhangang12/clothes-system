// ============================================================
// I9 服装制造管理系统 — 共享类型定义
// ============================================================

// ---------- 通用 ----------
export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
  total?: number;
}

export interface PageParams {
  page: number;
  size: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

// ---------- 枚举 ----------
export enum UserRole {
  ADMIN = 'ADMIN',
  BUSINESS = 'BUSINESS',
  FINANCE = 'FINANCE',
  PATTERNMAKER = 'PATTERNMAKER',
}

export enum FactoryType {
  MATERIAL = 'MATERIAL',
  PROCESS = 'PROCESS',
  BOTH = 'BOTH',
}

export enum CustomerGrade {
  A = 'A',
  B = 'B',
  C = 'C',
}

export enum SampleStatus {
  PENDING = 'PENDING',       // 待打版
  PATTERN = 'PATTERN',       // 打版中
  DONE = 'DONE',             // 打版完成
  CONFIRMED = 'CONFIRMED',   // 已确认
  REJECTED = 'REJECTED',     // 已驳回
}

export enum QuoteStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  CONFIRMED = 'CONFIRMED',
  TO_CONTRACT = 'TO_CONTRACT',
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  PRODUCING = 'PRODUCING',
  SHIPPED = 'SHIPPED',
  DONE = 'DONE',
}

export enum ContractType {
  MATERIAL = 'MATERIAL',
  PROCESS = 'PROCESS',
  SUPPLEMENT = 'SUPPLEMENT',
}

export enum ContractPortalStatus {
  DRAFT = 'DRAFT',
  PUSHED = 'PUSHED',
  STAMPED = 'STAMPED',
  SHIPPING = 'SHIPPING',
  RECONCILED = 'RECONCILED',
}

export enum ReconcileType {
  CONTRACT = 'CONTRACT',
  NO_CONTRACT = 'NO_CONTRACT',
}

export enum PaymentApprovalStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PAID = 'PAID',
}

export enum SettlementStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
}

// ---------- 工厂 ----------
export interface Factory {
  id: number;
  factoryNo: string;
  name: string;
  shortName?: string;
  type: FactoryType;
  contactName?: string;
  contactPhone?: string;
  address?: string;
  bankName?: string;
  bankAccount?: string;
  taxNo?: string;
  status: 0 | 1;
  remark?: string;
  createdAt: string;
}

export interface CreateFactoryDto {
  name: string;
  shortName?: string;
  type: FactoryType;
  contactName?: string;
  contactPhone?: string;
  address?: string;
  bankName?: string;
  bankAccount?: string;
  taxNo?: string;
  remark?: string;
}

// ---------- 客户 ----------
export interface Customer {
  id: number;
  customerNo: string;
  name: string;
  shortName?: string;
  grade: CustomerGrade;
  currency: string;
  paymentMethod?: string;
  country?: string;
  contactName?: string;
  contactEmail?: string;
  status: 0 | 1;
  createdAt: string;
}

export interface CreateCustomerDto {
  name: string;
  shortName?: string;
  grade: CustomerGrade;
  currency: string;
  paymentMethod?: string;
  country?: string;
  contactName?: string;
  contactEmail?: string;
}

// ---------- 样衣 ----------
export interface SampleGarment {
  id: number;
  sampleNo: string;
  customerId: number;
  customerName?: string;
  styleName: string;
  season?: string;
  category?: string;
  processReq?: string;
  patternmakerId?: number;
  patternmakerName?: string;
  version: number;
  status: SampleStatus;
  rejectReason?: string;
  confirmedAt?: string;
  createdBy: number;
  createdAt: string;
}

export interface CreateSampleDto {
  customerId: number;
  styleName: string;
  season?: string;
  category?: string;
  processReq?: string;
}

export interface SampleVersion {
  id: number;
  sampleId: number;
  version: number;
  action: 'SUBMIT' | 'REJECT' | 'CONFIRM';
  operatorId: number;
  operatorName?: string;
  remark?: string;
  createdAt: string;
}

// ---------- 报价 ----------
export interface QuotationItem {
  id?: number;
  sortOrder: number;
  itemName: string;
  unit?: string;
  usageQty?: number;
  unitPrice?: number;
  lossRate: number;
  lossPrice?: number;  // 含损单价，后端计算
  totalUsage?: number;
  subtotal?: number;
}

export interface Quotation {
  id: number;
  quoteNo: string;
  customerId: number;
  customerName?: string;
  sampleId?: number;
  styleName?: string;
  globalLossRate: number;
  unitPrice?: number;
  currency: string;
  grossMargin?: number;
  totalQty?: number;
  totalAmount?: number;
  status: QuoteStatus;
  items: QuotationItem[];
  sentAt?: string;
  confirmedAt?: string;
  createdAt: string;
}

// ---------- 合同 ----------
export interface ContractMaterial {
  id?: number;
  sortOrder: number;
  itemName: string;
  spec?: string;
  unit?: string;
  unitPrice: number;
  qty: number;
  amount: number;
  remark?: string;
}

export interface Contract {
  id: number;
  contractNo: string;
  type: ContractType;
  parentId?: number;
  factoryId: number;
  factoryName?: string;
  orderId: number;
  orderNo?: string;
  totalAmount: number;
  currency: string;
  depositRatio: number;
  midRatio: number;
  finalRatio: number;
  lastShipDate?: string;
  accountPeriodDays: number;
  dueDate?: string;
  portalStatus: ContractPortalStatus;
  pushedAt?: string;
  stampedAt?: string;
  snapshotJson?: Record<string, unknown>;
  materials: ContractMaterial[];
  createdAt: string;
}

// ---------- 对账/付款 ----------
export interface Reconciliation {
  id: number;
  reconcileNo: string;
  type: ReconcileType;
  contractId?: number;
  factoryId: number;
  factoryName?: string;
  totalAmount: number;
  taxRate?: number;
  invoiceNo?: string;
  invoiceAmount?: number;
  invoiceDiff?: number;
  hasInvoice: boolean;
  status: 'DRAFT' | 'CONFIRMED' | 'PAID';
  createdAt: string;
}

export interface PaymentRequest {
  id: number;
  prNo: string;
  type: ReconcileType;
  reconcileId?: number;
  factoryId: number;
  amount: number;
  prepayOffset: number;
  actualPay?: number;
  slipUrl?: string;
  approvalStatus: PaymentApprovalStatus;
  submittedAt?: string;
  approvedAt?: string;
  rejectReason?: string;
  createdAt: string;
}

// ---------- 结算 ----------
export interface SettlementProfit {
  grossProfit: number;
  grossMargin: number;
  taxRefund: number;
  netProfit: number;          // 含退税
  netProfitExRefund: number;  // 不含退税
}

export interface Settlement {
  id: number;
  jsNo: string;
  orderId: number;
  orderNo?: string;
  shippedQty: number;
  currency: string;
  exchangeRate?: number;
  revenue: number;
  costTotal: number;
  costPerUnit?: number;
  profit: SettlementProfit;
  status: SettlementStatus;
  confirmedAt?: string;
  createdAt: string;
}

// ---------- 门户步骤 ----------
export interface PortalContractStep {
  step: 1 | 2 | 3 | 4;
  label: string;
  status: 'done' | 'active' | 'locked';
  completedAt?: string;
}
