import { IsNumber, IsOptional, IsString, IsDateString, Min, MaxLength } from 'class-validator';

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

  // 相关款号(预付登记归集,P3#40/补充C2)
  @IsOptional() @IsString() @MaxLength(60) style_no?: string;
}
