import { IsString, IsNumber, IsOptional, IsIn, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddCostDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100) // 列宽 VARCHAR(100)
  cost_name: string;

  @ApiProperty({ description: '金额;负数=退运/索赔冲减行(P3#39/结算Q19)' })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsIn([0, 1])
  has_invoice?: number;

  // B136：税率此前无下限，-100 会让 amount/(1+rate/100) 除以 0 写出 Infinity → decimal 列 500
  @ApiPropertyOptional({ description: '该行税率%（有票按此换不含税，缺省13；0~100）', default: 13 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tax_rate?: number;
}
