import { IsString, IsNumber, IsPositive, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddCostDto {
  @ApiProperty()
  @IsString()
  cost_name: string;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsIn([0, 1])
  has_invoice?: number;
}
