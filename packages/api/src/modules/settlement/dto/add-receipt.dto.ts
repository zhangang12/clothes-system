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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}
