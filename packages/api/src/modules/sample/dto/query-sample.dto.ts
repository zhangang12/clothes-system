import { IsOptional, IsEnum, IsInt, IsString, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SampleStatus } from '@i9/types';

export class QuerySampleDto {
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

  @ApiPropertyOptional({ enum: SampleStatus })
  @IsOptional()
  @IsEnum(SampleStatus)
  status?: SampleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customer_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  patternmaker_id?: number;

  // ── 高级筛选（设计稿 §C）──
  @ApiPropertyOptional({ description: '客户款号（模糊）' })
  @IsOptional() @IsString() style_no?: string;

  @ApiPropertyOptional({ description: '中间商名称（模糊）' })
  @IsOptional() @IsString() middleman_name?: string;

  @ApiPropertyOptional({ description: '制版师姓名（模糊）' })
  @IsOptional() @IsString() patternmaker_name?: string;

  @ApiPropertyOptional({ description: '制单人（模糊）' })
  @IsOptional() @IsString() maker?: string;

  @ApiPropertyOptional({ description: '样衣类别（含即匹配）' })
  @IsOptional() @IsString() categories?: string;

  @ApiPropertyOptional({ description: '制单日期起 YYYY-MM-DD' })
  @IsOptional() @IsDateString() make_start?: string;

  @ApiPropertyOptional({ description: '制单日期止 YYYY-MM-DD' })
  @IsOptional() @IsDateString() make_end?: string;

  @ApiPropertyOptional({ description: '寄出日期起 YYYY-MM-DD' })
  @IsOptional() @IsDateString() ship_start?: string;

  @ApiPropertyOptional({ description: '寄出日期止 YYYY-MM-DD' })
  @IsOptional() @IsDateString() ship_end?: string;
}
