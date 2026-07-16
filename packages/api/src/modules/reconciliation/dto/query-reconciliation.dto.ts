import { IsEnum, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ReconcileType } from '@i9/types';
import { ReconciliationStatus } from '../reconciliation.entity';

export class QueryReconciliationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  size?: number;

  @IsOptional()
  @IsEnum(ReconcileType)
  type?: ReconcileType;

  @IsOptional()
  @IsEnum(ReconciliationStatus)
  status?: ReconciliationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  factory_id?: number;

  // 单据反查（关联单据 chip）：合同 → 挂在其名下的对账单
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  contract_id?: number;

  @IsOptional()
  keyword?: string;
}
