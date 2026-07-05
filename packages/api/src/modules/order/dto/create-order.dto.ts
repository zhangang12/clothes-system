import {
  IsString, IsOptional, IsInt, IsNumber, IsArray, IsDateString,
  MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderMaterialDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  item_name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) part?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) width?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) composition?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) supplier?: string;
  @ApiPropertyOptional({ description: 'NONE/BY_SIZE/BY_COLOR' }) @IsOptional() @IsString() @MaxLength(10) split_mode?: string;
  @ApiPropertyOptional({ description: '最终采购量（业务微调，超±10%需确认）' }) @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) final_purchase?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  net_usage?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  loss_rate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unit_price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  quote_item_id?: number;
}

export class CreateOrderDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customer_id: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  customer_po?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  quote_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  style_name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) style_no?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() buyer_id?: number;
  @ApiPropertyOptional({ example: 0, description: '佣金%' }) @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) commission_rate?: number;
  @ApiPropertyOptional({ description: '生产工厂ID' }) @IsOptional() @Type(() => Number) @IsInt() factory_id?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) salesperson?: string;
  @ApiPropertyOptional({ description: '整单核算模式 NONE/BY_SIZE/BY_COLOR' }) @IsOptional() @IsString() @MaxLength(10) split_mode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  delivery_date?: string;

  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qty_total: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unit_price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ type: [CreateOrderMaterialDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderMaterialDto)
  materials?: CreateOrderMaterialDto[];

  @ApiPropertyOptional({ description: '尺码矩阵 JSON' })
  @IsOptional()
  matrix_data?: Record<string, unknown>;
}

export class AddShipmentDto {
  @ApiProperty()
  @IsDateString()
  shipment_date: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  qty: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  cartons?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tracking_no?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}
