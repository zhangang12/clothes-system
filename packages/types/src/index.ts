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

// 工厂/厂商类型（基础资料设计稿 §1.1：面料/辅料/委外/货代/测试/出口/其他）
export enum FactoryType {
  FABRIC = 'FABRIC',       // 面料供应商
  ACCESSORY = 'ACCESSORY', // 辅料供应商
  OUTSOURCE = 'OUTSOURCE', // 委外加工商
  FORWARDER = 'FORWARDER', // 货代
  TESTING = 'TESTING',     // 测试公司
  EXPORT = 'EXPORT',       // 出口公司
  OTHER = 'OTHER',         // 其他
}

export const FACTORY_TYPE_LABEL: Record<FactoryType, string> = {
  [FactoryType.FABRIC]: '面料供应商',
  [FactoryType.ACCESSORY]: '辅料供应商',
  [FactoryType.OUTSOURCE]: '委外加工商',
  [FactoryType.FORWARDER]: '货代',
  [FactoryType.TESTING]: '测试公司',
  [FactoryType.EXPORT]: '出口公司',
  [FactoryType.OTHER]: '其他',
};

// 客户类型（基础资料设计稿 §2.1：中间商 / 最终买家）
export enum CustomerType {
  MIDDLEMAN = 'MIDDLEMAN', // 中间商
  BUYER = 'BUYER',         // 最终买家
}

export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  [CustomerType.MIDDLEMAN]: '中间商',
  [CustomerType.BUYER]: '最终买家',
};

// 信用等级（客户资料「信用等级」字典字段）
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

// ---------- 工厂 / 厂商资料（基础资料设计稿 §1，35 字段 + 联系人子表） ----------
export interface FactoryContact {
  id?: number;
  name?: string;
  department?: string;
  title?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  remark?: string;
  sortOrder?: number;
}

export interface Factory {
  id: number;
  factoryNo: string;             // 厂商编号 S001（自动生成、大写、唯一）
  type: FactoryType;             // 工厂类型（必填）
  canInvoice: boolean;           // 能否开票（默认是）
  name: string;                  // 厂商名称（必填、唯一）
  shortName?: string;
  contactName?: string;          // 主联系人（保存时自动取联系人子表首行）
  contactPhone?: string;         // 主联系电话（同上）
  province?: string;             // 所在省份
  city?: string;                 // 所在城市（随省份联动）
  address?: string;              // 详细地址
  businessScope?: string;        // 业务范围
  developDate?: string;          // 开发时间（默认今天）
  // 财务信息
  bankName?: string; bankAccount?: string; taxNo?: string; invoicePhone?: string; invoiceAddress?: string;
  // 财务信息(2)
  bankName2?: string; bankAccount2?: string; taxNo2?: string; invoicePhone2?: string; invoiceAddress2?: string;
  // 备注信息
  legalRep?: string;             // 法人代表
  registeredCapital?: number;    // 注册资金
  establishedDate?: string;      // 设立时间
  annualSales?: number;          // 年销售额
  representativeCustomers?: string; // 代表客户
  qualityCerts?: string;         // 质量证书
  remark?: string;
  lastTradeDate?: string;        // 最后交易日期（列表超期标红）
  status: 0 | 1;
  contacts?: FactoryContact[];
  createdAt: string;
}

export interface CreateFactoryDto {
  type: FactoryType;
  canInvoice?: boolean;
  name: string;
  shortName?: string;
  province?: string;
  city?: string;
  address?: string;
  businessScope?: string;
  developDate?: string;
  bankName?: string; bankAccount?: string; taxNo?: string; invoicePhone?: string; invoiceAddress?: string;
  bankName2?: string; bankAccount2?: string; taxNo2?: string; invoicePhone2?: string; invoiceAddress2?: string;
  legalRep?: string;
  registeredCapital?: number;
  establishedDate?: string;
  annualSales?: number;
  representativeCustomers?: string;
  qualityCerts?: string;
  remark?: string;
  contacts?: FactoryContact[];
}

// ---------- 客户资料（基础资料设计稿 §2，机密单据，47 字段 + 联系人/开户银行/快件三子表） ----------
export interface CustomerContact {
  id?: number;
  name?: string;
  department?: string;
  gender?: string;      // M(男)/F(女)
  title?: string;
  phone?: string;
  mobile?: string;
  mobile1?: string;
  mobile2?: string;
  email?: string;
  remark?: string;
  sortOrder?: number;
}

export interface CustomerBank {
  id?: number;
  accountName?: string; // 开户名称（自动=客户名称）
  bankName?: string;
  bankAccount?: string;
  bankAddress?: string;
  currency?: string;
  swiftCode?: string;
  remark?: string;
  sortOrder?: number;
}

export interface CustomerExpress {
  id?: number;
  company?: string;     // 快件公司（来自工厂资料）
  account?: string;
  payMethod?: string;   // 到付 / 预付
  remark?: string;
  sortOrder?: number;
}

export interface Customer {
  id: number;
  customerNo: string;              // 客户编号 CN001（自动生成、唯一）
  name: string;                    // 客户名称（唯一）
  type: CustomerType;              // 客户类型（必填）中间商/最终买家
  relatedMiddleman?: string;       // 关联中间商（type=BUYER 时显示必填；存中间商客户ID逗号串）
  tradeCountry?: string;           // 贸易国别
  countryRegion?: string;          // 国家区域（随贸易国别自动带出）
  city?: string;
  homepage?: string;
  address?: string;
  priceTerms?: string;             // 价格条款（字典）
  settlementMethod?: string;       // 结汇方式（字典）
  grade?: CustomerGrade;           // 信用等级（字典 A/B/C）
  cooperationLevel?: string;       // 合作等级（字典）
  customerSource?: string;         // 客户来源（字典）
  paymentDays?: number;            // 付款期限（天）
  businessScope?: string;
  salesperson?: string;            // 外销员（默认当前登录人）
  developDate?: string;
  spare1?: string; spare2?: string; spare3?: string;
  deliveryAddress?: string;        // 收货地址
  frontMark?: string;              // 正面唛头
  sideMark?: string;               // 侧面唛头
  innerBoxText?: string;           // 内盒文字
  customerRemark?: string;         // 客户备注
  currency?: string;               // 主结算币种（下游报价/订单默认取值）
  status: 0 | 1;
  contacts?: CustomerContact[];
  banks?: CustomerBank[];
  expresses?: CustomerExpress[];
  createdAt: string;
}

export interface CreateCustomerDto {
  name?: string;
  type: CustomerType;
  relatedMiddleman?: string;
  tradeCountry?: string;
  countryRegion?: string;
  city?: string;
  homepage?: string;
  address?: string;
  priceTerms?: string;
  settlementMethod?: string;
  grade?: CustomerGrade;
  cooperationLevel?: string;
  customerSource?: string;
  paymentDays?: number;
  businessScope?: string;
  salesperson?: string;
  developDate?: string;
  spare1?: string; spare2?: string; spare3?: string;
  deliveryAddress?: string;
  frontMark?: string;
  sideMark?: string;
  innerBoxText?: string;
  customerRemark?: string;
  currency?: string;
  contacts?: CustomerContact[];
  banks?: CustomerBank[];
  expresses?: CustomerExpress[];
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
