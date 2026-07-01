import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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
}
