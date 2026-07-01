import {
  IsString, IsOptional, IsInt, IsNumber, IsArray, IsEnum,
  MaxLength, Min, Max, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateQuoteItemDto {
  @ApiProperty({ example: '面料' })
  @IsString()
  @MaxLength(100)
  item_name: string;

  @ApiPropertyOptional({ example: '米' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({ example: 1.5, description: '净用量' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  usage_qty?: number;

  @ApiProperty({ example: 12.5, description: '原单价' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unit_price: number;

  @ApiPropertyOptional({ example: 5, description: '损耗率%' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99.99)
  loss_rate?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class CreateQuoteDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customer_id: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sample_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  style_name?: string;

  @ApiPropertyOptional({ example: 0, description: '全局损耗率%' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99.99)
  global_loss_rate?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  currency?: string;

  @ApiPropertyOptional({ example: 30, description: '目标毛利率%' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  gross_margin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  total_qty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ type: [CreateQuoteItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  items?: CreateQuoteItemDto[];
}
