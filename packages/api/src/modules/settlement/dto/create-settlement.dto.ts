import { IsInt, IsPositive, IsNumber, IsOptional, IsString, IsArray, ValidateNested, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCostLineDto {
  @ApiProperty({ description: '成本项名称（材料/加工/货代等，来自对账付款）' })
  @IsString()
  cost_name: string;

  @ApiProperty({ description: '含税金额' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ description: '是否有票 1/0（无票按含税全额进不含税，防毛利虚高）', default: 1 })
  @IsOptional()
  @IsIn([0, 1])
  has_invoice?: number;

  @ApiPropertyOptional({ description: '该行税率%（有票按此换不含税，缺省13）', default: 13 })
  @IsOptional()
  @IsNumber()
  tax_rate?: number;
}

export class CreateSettlementDto {
  @ApiProperty({ description: '订单ID（带出款号/出货件数）' })
  @IsInt()
  @IsPositive()
  order_id: number;

  @ApiPropertyOptional({ description: '成本明细（对账付款汇总，含税）；给出则总货款含税=各行合计' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCostLineDto)
  costs?: CreateCostLineDto[];

  @ApiPropertyOptional({ description: '总货款(含税)——未提供 costs 明细时直接给汇总值', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  goods_amount_tax?: number;

  @ApiPropertyOptional({ description: '发票金额(USD)——用于算美金单价/保本汇率', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  invoice_amount_usd?: number;

  @ApiPropertyOptional({ description: '实际收汇金额(USD)——结算金额=收汇×汇率', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  receipt_usd?: number;

  @ApiPropertyOptional({ description: '结算汇率（草稿可空，收汇后填）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  exchange_rate?: number;

  @ApiPropertyOptional({ description: '运杂费（进净利扣减）', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  freight_fee?: number;

  @ApiPropertyOptional({ description: '快邮费（国际+国内，进净利扣减）', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  express_fee?: number;

  @ApiPropertyOptional({ description: '打样费（进净利扣减）', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sample_fee?: number;

  @ApiPropertyOptional({ description: '其它费用（进净利扣减）', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  other_fee?: number;

  @ApiPropertyOptional({ description: '出口退税（含退税净利=净利+退税）', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tax_refund?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
