import { IsEnum, IsNumber, IsOptional, IsString, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ReconcileType } from '@i9/types';

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
}
