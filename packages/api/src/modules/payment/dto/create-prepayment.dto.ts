import { IsNumber, IsOptional, IsString, IsDateString, Min } from 'class-validator';

export class CreatePrepaymentDto {
  @IsNumber()
  factory_id: number;

  @IsOptional()
  @IsNumber()
  contract_id?: number;

  @IsNumber()
  @Min(0.0001)
  amount: number;

  @IsDateString()
  pay_date: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
