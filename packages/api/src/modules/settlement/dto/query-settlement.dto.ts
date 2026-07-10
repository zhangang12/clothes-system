import { IsOptional, IsInt, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QuerySettlementDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order_id?: number;

  // 高级筛选(P2#26):'1'=仅看亏损(净利<0且利润可信)
  @IsOptional()
  @IsString()
  loss?: string;

  // '1'=仅看待重算
  @IsOptional()
  @IsString()
  needs_recalc?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}
