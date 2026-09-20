import { IsNumber, IsOptional, IsPositive, IsString, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { DATE_STR_RE } from './create-export-invoice.dto';

// 逐笔收汇登记（B006/B127：此前 @Body() dto: any，日期/金额零校验，非法日期写 DATE 列 500）。
// 字段对齐前端 ExportInvoiceView.receiptForm：exchange_rate / slip_url 为空时前端不发，remark 可为空串
export class AddReceiptDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: '收汇金额须大于 0' })
  amount: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: '汇率须大于 0' }) // B136 同类：无下限的比率字段
  exchange_rate?: number;

  @IsString({ message: '请选择收汇日期' })
  @Matches(DATE_STR_RE, { message: '收汇日期格式须为 YYYY-MM-DD' })
  receipt_date: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  slip_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}
