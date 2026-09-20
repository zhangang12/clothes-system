import { IsIn, IsNumber, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 分批付款登记（B057/B006/B127）：此前 body 是 any，amount 传字符串会变成字符串拼接、pay_date 乱填直接写 DATE 列 500。
// 字段与前端 PaymentListView.doAddRecord 发的一致：pay_method / pay_date / amount / slip_url? / remark?
export class AddPaymentRecordDto {
  @ApiPropertyOptional({ description: '付款方式', enum: ['BANK', 'ACCEPTANCE', 'OTHER'], default: 'BANK' })
  @IsOptional()
  @IsIn(['BANK', 'ACCEPTANCE', 'OTHER'])
  pay_method?: string;

  @ApiProperty({ description: '付款日期 YYYY-MM-DD' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '付款日期格式须为 YYYY-MM-DD' })
  pay_date: string;

  @ApiProperty({ description: '本次付款金额' })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: '本次付款金额须为数字' })
  @IsPositive({ message: '本次付款金额须大于 0' })
  amount: number;

  @ApiPropertyOptional({ description: '银行水单' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  slip_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}
