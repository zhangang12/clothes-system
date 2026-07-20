import { IsArray, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class ShipLineDto {
  // bigint 主键经 mysql2 返回字符串，须显式转型（同 createReconcile 的 shipment_ids 写法）
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  material_id?: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  qty: number;
}

export class MergeShipEntryDto {
  // bigint 主键经 mysql2 返回字符串，无 @Type 会被全局 ValidationPipe 判 400（H7）
  @Type(() => Number)
  @IsNumber()
  contract_id: number;

  @IsOptional()
  @Type(() => Number)
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
