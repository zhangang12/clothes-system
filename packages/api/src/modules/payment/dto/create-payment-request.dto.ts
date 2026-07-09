import { IsEnum, IsNumber, IsOptional, IsString, IsInt, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReconcileType } from '@i9/types';

export class CreatePaymentRequestDto {
  @IsEnum(ReconcileType)
  type: ReconcileType;

  @IsOptional()
  @IsNumber()
  reconcile_id?: number;

  @IsNumber()
  factory_id: number;

  @IsNumber()
  @Min(0.0001)
  amount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  prepay_offset?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '结算账期(天),缺省从合同带入' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  account_period_days?: number;

  @ApiPropertyOptional({ description: '到期日,缺省从合同带入(出货日+账期)' })
  @IsOptional()
  @IsDateString()
  due_date?: string;

}
