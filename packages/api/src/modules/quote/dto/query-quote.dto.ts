import { IsOptional, IsEnum, IsInt, IsString, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteStatus } from '@i9/types';

export class QueryQuoteDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  keyword?: string;

  @ApiPropertyOptional({ enum: QuoteStatus })
  @IsOptional()
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customer_id?: number;

  // ── 高级筛选（设计稿 §B：单字段精确筛 + 询价日期范围）──
  @ApiPropertyOptional({ description: '报价单号（模糊）' })
  @IsOptional()
  @IsString()
  quote_no?: string;

  @ApiPropertyOptional({ description: '客户款号（模糊）' })
  @IsOptional()
  @IsString()
  style_no?: string;

  @ApiPropertyOptional({ description: '中间商名称（模糊）' })
  @IsOptional()
  @IsString()
  middleman_name?: string;

  @ApiPropertyOptional({ description: '最终买家名称（模糊）' })
  @IsOptional()
  @IsString()
  buyer_name?: string;

  @ApiPropertyOptional({ description: '业务员（模糊）' })
  @IsOptional()
  @IsString()
  salesperson?: string;

  @ApiPropertyOptional({ description: '询价日期起（含）' })
  @IsOptional()
  @IsDateString()
  inquiry_start?: string;

  @ApiPropertyOptional({ description: '询价日期止（含）' })
  @IsOptional()
  @IsDateString()
  inquiry_end?: string;
}
