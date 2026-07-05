import { IsEnum, IsNumber, IsOptional, IsString, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ReconcileType, ReconcileSubType } from '@i9/types';

// 无合同空白对账单·费用明细行（补充确认v1.1）
export class CreateExpenseLineDto {
  @IsString()
  expense_name: string; // 费用项目/事由

  @IsNumber() @Min(0)
  amount: number;

  @IsOptional() @IsString()
  style_no?: string;

  @IsOptional() @IsString()
  attach_url?: string;
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
}
