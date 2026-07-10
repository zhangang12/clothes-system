import { IsNumber, IsPositive, IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddReceiptDto {
  @ApiProperty({ description: '回款金额' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: '回款日期 YYYY-MM-DD' })
  @IsDateString()
  receipt_date: string;

  @ApiPropertyOptional({ description: '该笔收汇汇率（银行水单带入）；各笔齐备时结算金额=Σ(金额×汇率)、头上汇率=加权平均' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchange_rate?: number;

  @ApiPropertyOptional({ description: '银行水单附件' })
  @IsOptional()
  @IsString()
  slip_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}
