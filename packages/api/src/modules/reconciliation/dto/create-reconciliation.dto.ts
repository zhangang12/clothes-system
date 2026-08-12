import { IsEnum, IsNumber, IsOptional, IsString, IsArray, ValidateNested, Min, IsBoolean, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ReconcileType, ReconcileSubType } from '@i9/types';

// 无合同空白对账单·费用明细行（补充确认v1.1）
export class CreateExpenseLineDto {
  @IsString()
  @MaxLength(200) // 对齐列宽：此前无限制，超长直接 500（举一反三 A2）
  expense_name: string; // 费用项目/事由

  @IsNumber() @Min(0)
  amount: number;

  @IsOptional() @IsString()
  style_no?: string;

  @IsOptional() @IsString()
  attach_url?: string;
}

/**
 * 合同类对账·扣款明细行（2026-08-12 #74，业务拍板：已确认合同要打折/次品退货怎么处理）。
 *
 * 【为什么不改合同】合同一旦确认就已推送给工厂、下游还挂着发货批次；为一次打折去改合同，
 * 等于把已经成立的约定推翻重来。业务定的口径是**合同保持原样**，在对账环节挂一条扣款：
 * 对账金额 = 发货金额 − 扣款，后面的付款、结算自然跟着这个数走。
 *
 * 【金额的符号】按业务原话「可填负数」——**这里填的就是带符号的调整额**：
 * 打折/次品退货填负数（如 -500），少扣了要补回填正数。不做正负转换，
 * 界面填什么、库里存什么、导出显示什么，三处一致，免得对账时对不上号。
 */
export class CreateDeductionLineDto {
  @IsString()
  @MaxLength(200) // 对齐 reconciliation_expense_item.expense_name 列宽
  reason: string; // 扣款事由：次品退货 / 客户打折 / 数量短装…

  @IsNumber()
  amount: number; // 带符号：扣款为负

  @IsOptional() @IsString()
  style_no?: string;

  @IsOptional() @IsString()
  attach_url?: string; // 照片 / 说明附件
}

export class CreateShipmentLineDto {
  @IsNumber()
  shipment_id: number;

  // 一单多合同：每条批次可指向各自来源合同/款号（批次明细可点跳，设计稿 对账·一单多合同）
  @IsOptional()
  @IsNumber()
  contract_id?: number;

  @IsOptional()
  @IsString()
  style_no?: string;

  @IsString()
  item_name: string;

  @IsNumber()
  @Min(0)
  snapshot_unit_price: number;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsOptional() @IsString()
  remark?: string; // 逐批批注
}

export class CreateReconciliationDto {
  @IsEnum(ReconcileType)
  type: ReconcileType;

  // 无合同空白对账单子类型：费用/现金无票/预付款（补充确认v1.1）
  @IsOptional()
  @IsEnum(ReconcileSubType)
  subType?: ReconcileSubType;

  @IsOptional()
  @IsNumber()
  contract_id?: number;

  // 补料对账并入原合同(P3遗留/补充C2·qc E8):补料合同的对账在核算上归并到母合同名下(业务勾选)
  @IsOptional()
  @IsBoolean()
  merge_into_parent?: boolean;

  @IsNumber()
  factory_id: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax_rate?: number;

  @IsOptional()
  @IsString()
  invoice_no?: string;

  @IsOptional()
  @IsNumber()
  invoice_amount?: number;

  @IsOptional()
  @IsString()
  invoice_url?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentLineDto)
  shipments?: CreateShipmentLineDto[];

  // 无合同空白对账单·费用明细
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseLineDto)
  expenses?: CreateExpenseLineDto[];

  // 合同类对账·扣款明细（#74）。与 expenses 共用 reconciliation_expense_item 表：
  // 那张表本来就是「事由 + 金额 + 款号 + 附件」四件套，扣款需要的字段一个不差，
  // 没必要为此再建一张表（也就不必走存量库结构升级）。
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDeductionLineDto)
  deductions?: CreateDeductionLineDto[];
}
