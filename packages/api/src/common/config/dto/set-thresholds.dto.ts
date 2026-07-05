import { IsOptional, IsNumber, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SetThresholdsDto {
  @ApiPropertyOptional({ description: '报价审批阈值（人民币合计，0=不启用）' })
  @IsOptional() @IsNumber() @Min(0) quote?: number;

  @ApiPropertyOptional({ description: '订单审批阈值（订单金额，0=不启用）' })
  @IsOptional() @IsNumber() @Min(0) order?: number;

  @ApiPropertyOptional({ description: '合同审批阈值（合同金额，0=不启用）' })
  @IsOptional() @IsNumber() @Min(0) contract?: number;
}
