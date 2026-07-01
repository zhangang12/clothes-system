import { IsInt, IsPositive, IsNumber, IsOptional, IsString, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCostLineDto {
  @ApiProperty({ description: '费用名称' })
  @IsString()
  cost_name: string;

  @ApiProperty({ description: '费用金额' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ description: '是否有票 1/0', default: 1 })
  @IsOptional()
  @IsIn([0, 1])
  has_invoice?: number;
}

export class CreateSettlementDto {
  @ApiProperty({ description: '订单ID' })
  @IsInt()
  @IsPositive()
  order_id: number;

  @ApiProperty({ description: '应收收入' })
  @IsNumber()
  revenue: number;

  @ApiPropertyOptional({ description: '费用明细' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCostLineDto)
  costs?: CreateCostLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
