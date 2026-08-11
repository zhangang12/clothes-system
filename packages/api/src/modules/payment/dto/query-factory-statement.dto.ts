import { IsOptional, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 工厂账单查询（2026-08-11 qiao：按工厂拉出该公司所有账单）。
// 日期字段沿用本模块既有口径：@IsString() 而非 @IsDateString()——前端清空日期区间会发空串 ''，
// IsDateString 会直接 400；service 侧对 falsy 一律当"不筛"，故保持宽松（同 QueryPaymentRequestDto）。
export class QueryFactoryStatementDto {
  @ApiProperty({ description: '工厂 ID' })
  @Type(() => Number)
  @IsInt()
  factory_id: number;

  @ApiPropertyOptional({ description: '区间起（含）' })
  @IsOptional()
  @IsString()
  start_date?: string;

  @ApiPropertyOptional({ description: '区间止（含）' })
  @IsOptional()
  @IsString()
  end_date?: string;
}
