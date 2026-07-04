import { IsInt, IsPositive, IsNumber, IsOptional, IsString, IsArray, ValidateNested, IsIn, Min } from 'class-validator';
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

  @ApiPropertyOptional({ description: '汇率快照（外币结算时填写，缺省按1处理）' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchange_rate?: number;

  @ApiPropertyOptional({ description: '退税金额（含税面料采购额×(退税率-增值税率差)，由财务按当期税率核算后填入）', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tax_refund?: number;
}
