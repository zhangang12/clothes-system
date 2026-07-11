import { IsString, IsNumber, IsPositive, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddCostDto {
  @ApiProperty()
  @IsString()
  cost_name: string;

  @ApiProperty({ description: '金额;负数=退运/索赔冲减行(P3#39/结算Q19)' })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsIn([0, 1])
  has_invoice?: number;

  @ApiPropertyOptional({ description: '该行税率%（有票按此换不含税，缺省13）', default: 13 })
  @IsOptional()
  @IsNumber()
  tax_rate?: number;
}
