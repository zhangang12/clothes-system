import { IsEnum, IsNumber, IsOptional, IsString, IsInt, IsDateString, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReconcileType } from '@i9/types';

export class CreatePaymentRequestDto {
  @IsEnum(ReconcileType)
  type: ReconcileType;

  // 以下四个都加 @Type(() => Number)：编辑草稿时前端从列表行取值回填（openEditPR），
  // bigint/decimal 从库里读出来是字符串，不转就是「factory_id must be a number」整单 400。
  // 这几列都是普通列赋值，不参与 TypeORM 的主键判定，转成数字是安全的
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  reconcile_id?: number;

  @Type(() => Number)
  @IsNumber()
  factory_id: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  amount: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  prepay_offset?: number;

  @IsOptional()
  @IsString()
  description?: string;

  // 无合同付款补字段(P3#40/对账E3)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bank_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bank_account?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  related_style_no?: string;

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

  // 发票（#92 King：「非合同付款可以我们自己上传发票吗？」）。
  // 合同付款的发票在对账单上，这里主要服务无合同付款；两者都允许填，不做类型限制——
  // 合同付款偶尔也有"对账时没票、付款时补票"的情况，卡死反而要业务绕路。
  @ApiPropertyOptional({ description: '发票号（非合同付款自行登记）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoice_no?: string;

  @ApiPropertyOptional({ description: '发票附件（非合同付款自行上传）' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  invoice_url?: string;

}
