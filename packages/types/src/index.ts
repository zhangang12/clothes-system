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
  SUPERVISOR = 'SUPERVISOR',     // 业务主管（对账单二级复核）
  SAMPLE_MAKER = 'SAMPLE_MAKER', // 打样
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

// 样衣状态机（样衣设计稿 §C：待派单/打样中/已寄出/已寄回/已对账/已完成/已成单）
export enum SampleStatus {
  PENDING = 'PENDING',       // 待派单
  SAMPLING = 'SAMPLING',     // 打样中（材料寄出单号填入/推送版师）
  SHIPPED = 'SHIPPED',       // 已寄出
  RETURNED = 'RETURNED',     // 已寄回（版师填寄回单号）
  RECONCILED = 'RECONCILED', // 已对账（件数+单价填完自动生成对账单）
  DONE = 'DONE',             // 已完成
  ORDERED = 'ORDERED',       // 已成单（被客户报价转销售合同后自动置，列表绿色加粗 B1）
}

export const SAMPLE_STATUS_LABEL: Record<SampleStatus, string> = {
  [SampleStatus.PENDING]: '待派单',
  [SampleStatus.SAMPLING]: '打样中',
  [SampleStatus.SHIPPED]: '已寄出',
  [SampleStatus.RETURNED]: '已寄回',
  [SampleStatus.RECONCILED]: '已对账',
  [SampleStatus.DONE]: '已完成',
  [SampleStatus.ORDERED]: '已成单',
};

// 样衣类别（7 类，可多选）
export const SAMPLE_CATEGORIES = ['销样', '头样', '二样', '三样', '产前样', '船样', '拍照样'];

// 报价状态机（客户报价设计稿 §B：草稿/已报价/客户调整/已成单）
export enum QuoteStatus {
  DRAFT = 'DRAFT',         // 草稿
  QUOTED = 'QUOTED',       // 已报价
  ADJUSTING = 'ADJUSTING', // 客户调整
  ORDERED = 'ORDERED',     // 已成单（转销售合同后）
}

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  [QuoteStatus.DRAFT]: '草稿',
  [QuoteStatus.QUOTED]: '已报价',
  [QuoteStatus.ADJUSTING]: '客户调整',
  [QuoteStatus.ORDERED]: '已成单',
};

// 费用明细新建自动带 6 行（客户报价设计稿 §费用明细）
export const DEFAULT_QUOTE_FEES = ['加工费', '线', '包装', '样衣费', '测试费', '运费'];

// 订单状态机（订单设计稿 §B：草稿/已下单/已生成合同/生产中/已完成）
export enum OrderStatus {
  DRAFT = 'DRAFT',           // 草稿
  CONFIRMED = 'CONFIRMED',   // 已下单
  CONTRACTED = 'CONTRACTED', // 已生成合同
  PRODUCING = 'PRODUCING',   // 生产中
  DONE = 'DONE',             // 已完成
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  [OrderStatus.DRAFT]: '草稿',
  [OrderStatus.CONFIRMED]: '已下单',
  [OrderStatus.CONTRACTED]: '已生成合同',
  [OrderStatus.PRODUCING]: '生产中',
  [OrderStatus.DONE]: '已完成',
};

// 材料拆分模式（订单设计稿 §用料核算）
export enum OrderSplitMode {
  NONE = 'NONE',       // 不拆
  BY_SIZE = 'BY_SIZE', // 按尺码
  BY_COLOR = 'BY_COLOR', // 按颜色
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
  LABOR = 'LABOR', // 样衣打样工时对账（版师/打样间，多款合并；独立于供应商对账）
}

export enum PaymentApprovalStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PAID = 'PAID',
}

// 金额阈值审批（报价/订单/合同金额超阈值需主管审批，阈值可配；设计稿 样衣确认清单·审批矩阵 rec:0）
export enum ApprovalStatus {
  NONE = 'NONE',         // 未触发审批（金额未超阈值或阈值未配）
  PENDING = 'PENDING',   // 超阈值，待主管审批
  APPROVED = 'APPROVED', // 主管已审批，放行
}

// 阈值配置键（存于 sys_config）
export const APPROVAL_THRESHOLD_KEYS = {
  QUOTE: 'approval.quote.threshold',
  ORDER: 'approval.order.threshold',
  CONTRACT: 'approval.contract.threshold',
} as const;

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

// ---------- 样衣（样衣设计稿：14 主字段 + 材料明细子表 + 寄样跟踪） ----------
export interface SampleMaterial {
  id?: number;
  sortOrder?: number;
  arrangeDate?: string;   // 安排日期
  itemName?: string;      // 品名（每款单独录入，不从面料库选）
  width?: string;         // 门幅
  colors?: string;        // 颜色（动态多列，逗号分隔）
  part?: string;          // 部位
  composition?: string;   // 成份
  codeBand?: string;      // 码带
  zipperLength?: string;  // 拉链长度（版师填）
  puller?: string;        // 拉头
  qty?: number;           // 数量
  size?: string;          // 尺寸(长×宽)
  refPrice?: number;      // 参考价格
  actualUsage?: number;   // 实际耗用（版师填）
  supplierId?: number;    // 供应商编号（工厂资料）
  supplierName?: string;  // 供应商名称（自动带出）
  image?: string;         // 图片
  remark?: string;
}

export interface SampleGarment {
  id: number;
  sampleNo: string;                // S-YYYYMMDD-序号
  categories?: string;             // 样衣类别（7 类多选，逗号分隔）
  middlemanId?: number;            // 中间商编号（客户资料·中间商）
  middlemanName?: string;          // 中间商名称（自动带出）
  styleNo: string;                 // 客户款号（必填，业务直接录入）
  buyerId?: number;                // 关联最终买家
  buyerName?: string;
  buyerNo?: string;                // 关联最终买家编号（自动带出）
  patternmakerId?: number;         // 制版师
  patternmakerName?: string;
  maker?: string;                  // 制单人员（默认当前登录人）
  makeDate?: string;               // 制单日期（今天）
  shipSampleDate?: string;         // 寄样日期
  recipient?: string;              // 收件人
  fileLocation?: string;           // 文件位置
  garmentRemark?: string;          // 成衣备注
  image1?: string; image2?: string; image3?: string;
  // 寄样跟踪
  materialShipNo?: string;         // 材料寄出单号（触发推送版师）
  materialShipDate?: string;       // 材料寄出日期（自动）
  returnNo?: string;               // 寄回快递单号（版师填）
  returnDate?: string;             // 寄回日期（自动）
  pieceCount?: number;             // 件数（版师填）
  laborUnitPrice?: number;         // 版师工时单价 CNY（版师填）
  laborAmount?: number;            // 工时金额 CNY = 件数 × 单价
  status: SampleStatus;
  customerId?: number;             // 兼容：主客户（=中间商）
  version: number;
  createdBy: number;
  createdAt: string;
  materials?: SampleMaterial[];
}

export interface CreateSampleDto {
  categories?: string;
  middlemanId?: number;
  customerId?: number;
  styleNo: string;
  buyerId?: number;
  patternmakerId?: number;
  maker?: string;
  shipSampleDate?: string;
  recipient?: string;
  fileLocation?: string;
  garmentRemark?: string;
  image1?: string; image2?: string; image3?: string;
  materials?: SampleMaterial[];
}

export interface SampleVersion {
  id: number;
  sampleId: number;
  version: number;
  action: string;
  operatorId: number;
  operatorName?: string;
  remark?: string;
  createdAt: string;
}

// ---------- 客户报价（设计稿：18 主字段 + 报价明细/费用明细双子表 + 报价合计3字段） ----------
// 报价明细（从样衣导入）12 字段
export interface QuotationItem {
  id?: number;
  sortOrder?: number;
  part?: string;          // 部位
  itemName: string;       // 品名（必填）
  width?: string;         // 门幅
  color?: string;         // 颜色
  supplier?: string;      // 供应商（PDF 默认隐藏）
  unit?: string;          // 计量单位
  quoteUsage?: number;    // 报价耗用（从样衣实际耗用带入，可改，独立快照）
  rmbPrice?: number;      // 人民币单价
  usdPrice?: number;      // 美金单价（自动=人民币单价/汇率）
  lossRate?: number;      // 损耗%（默认 3）
  lossAmount?: number;    // 含损金额（自动=人民币单价×报价耗用×(1+损耗)）
  remark?: string;
}

// 费用明细 4 字段
export interface QuotationFee {
  id?: number;
  sortOrder?: number;
  feeName: string;        // 费用名称
  rmbPrice?: number;      // 人民币单价
  usdPrice?: number;      // 美金单价（自动=人民币单价/汇率）
  quoteUsage?: number;    // 报价耗用（默认 1）
}

export interface Quotation {
  id: number;
  quoteNo: string;                 // Q-YYYYMMDD-序号
  inquiryDate?: string;            // 询价日期（默认今天）
  sampleId?: number;               // 关联样衣
  sampleNo?: string;
  middlemanId: number;             // 中间商（客户资料）
  middlemanName?: string;          // 自动带出
  buyerId?: number;                // 最终买家
  buyerName?: string;
  buyerNo?: string;                // 自动带出
  styleNo?: string;                // 客户款号
  middlemanContact?: string;       // 中间商联系人
  settlementCategory?: string;     // 结算类别（自动）
  currency: string;                // 外销币种（默认 USD）
  exchangeRate?: number;           // 汇率（>0）
  tradeCountry?: string;           // 贸易国别
  settlementMethod?: string;       // 结汇方式
  priceTerms?: string;             // 价格条款
  salesperson?: string;            // 外销员（默认当前登录人）
  profitRate?: number;             // 利润率%
  quoteQty?: number;               // 报价数量
  image1?: string; image2?: string;
  rmbTotal?: number;               // 报价人民币价格（含利润率，自动）
  usdTotal?: number;               // 报价美元价格（自动）
  totalRemark?: string;            // 备注说明
  customerId?: number;             // 兼容：主客户(=中间商)
  status: QuoteStatus;
  items?: QuotationItem[];
  fees?: QuotationFee[];
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
  grossProfit: number;        // 毛利=结算金额−总货款不含税
  grossMargin?: number;       // 毛利率%
  financeFee: number;         // 财务及管理费=结算金额×7%
  taxRefund: number;          // 出口退税
  netProfit: number;          // 净利(含退税)=净利+退税
  netProfitExRefund: number;  // 净利(不含退税)=毛利−期间费用−财务费7%
}

export interface Settlement {
  id: number;
  jsNo: string;               // 结算单号
  orderId: number;
  styleNo?: string;           // 款号
  orderNo?: string;
  shippedQty: number;         // 出货件数（船务）
  currency: string;
  exchangeRate?: number;      // 结算汇率
  // 成本明细（对账付款汇总）
  goodsAmountTax: number;     // 总货款(含税)
  goodsAmountExtax: number;   // 总货款(不含税)
  costPerUnitTax?: number;    // 成本单价(含税)
  costPerUnitExtax?: number;  // 成本单价(不含税)
  // 财务收汇
  invoiceAmountUsd: number;   // 发票金额(USD)
  receiptUsd: number;         // 实际收汇金额(USD)
  usdUnitPrice?: number;      // 美金单价=发票金额÷出货件数
  // 期间费用（进净利扣减）
  freightFee: number;         // 运杂费
  expressFee: number;         // 快邮费
  sampleFee: number;          // 打样费
  otherFee: number;           // 其它费用
  // 毛利对比
  settleAmount: number;       // 结算金额(RMB)=实际收汇×结算汇率
  breakevenRateTax?: number;  // 保本汇率(含税)
  breakevenRateExtax?: number;// 保本汇率(不含税)
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
