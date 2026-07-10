import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// 结算单编辑（草稿限定）：财务两步走——建单后收汇/汇率/发票金额可回头补（结算稿B/D）
export class UpdateSettlementDto {
  @ApiPropertyOptional({ description: '结算汇率（收汇后补填；有逐笔收汇汇率时以加权平均覆盖）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  exchange_rate?: number;

  @ApiPropertyOptional({ description: '发票金额(USD)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  invoice_amount_usd?: number;

  @ApiPropertyOptional({ description: '实际收汇金额(USD)——已有逐笔收汇记录时禁止手工覆盖' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  receipt_usd?: number;

  @ApiPropertyOptional({ description: '运杂费' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  freight_fee?: number;

  @ApiPropertyOptional({ description: '快邮费' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  express_fee?: number;

  @ApiPropertyOptional({ description: '打样费' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sample_fee?: number;

  @ApiPropertyOptional({ description: '其它费用' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  other_fee?: number;

  @ApiPropertyOptional({ description: '出口退税' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tax_refund?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
