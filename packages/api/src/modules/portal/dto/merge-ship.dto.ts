import { IsArray, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class ShipLineDto {
  @IsOptional()
  @IsNumber()
  material_id?: number;

  @IsNumber()
  @IsPositive()
  qty: number;
}

export class MergeShipEntryDto {
  @IsNumber()
  contract_id: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  qty?: number;

  // 逐物料行实发数（P3#30）：给出则批次数量=Σ行、金额=Σ行金额
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipLineDto)
  items?: ShipLineDto[];
}

// 跨合同合并发货（P3#29/门户C2）：同供应商勾多张合同，一套物流，明细分摊各合同
export class MergeShipDto {
  @IsString()
  @MaxLength(50)
  express_company: string;

  @IsString()
  @MaxLength(50)
  express_no: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  attach_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ship_address?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => MergeShipEntryDto)
  entries: MergeShipEntryDto[];
}
