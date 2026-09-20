import {
  ArrayNotEmpty, IsArray, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString,
  Matches, MaxLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** 业务日期统一 YYYY-MM-DD（B127：只判非空不判格式，非法日期写 DATE 列直接 500） */
export const DATE_STR_RE = /^\d{4}-\d{2}-\d{2}$/;

// 出口发票款项行（一票多款）。字段对齐前端 ExportInvoiceView.form.items：
// order_id 由下拉选择，未选/清空时前端不发或发空串——空串归 undefined，别让 @IsNumber 把整单打成 400
export class ExportInvoiceItemDto {
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsOptional()
  @IsNumber()
  order_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60) // 对齐 export_invoice_item.style_no 列宽
  style_no?: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: '款项金额须大于 0' }) // B136 同类：金额无下限会把总额算成 0/负数，分摊时除出 Infinity
  amount: number;
}

// 登记出口发票（B047：此前是 interface，运行时零校验——漏填发票号 NOT NULL 500、超 50 字 Data too long 500）
export class CreateExportInvoiceDto {
  @IsString()
  @IsNotEmpty({ message: '请填写发票号' })
  @MaxLength(50, { message: '发票号不能超过 50 个字符' }) // 对齐 export_invoice.invoice_no VARCHAR(50)
  invoice_no: string;

  // 前端未填时发空串，跳过格式校验（service 里空串归 NULL）
  @IsOptional()
  @ValidateIf((o) => !!o.invoice_date)
  @Matches(DATE_STR_RE, { message: '发票日期格式须为 YYYY-MM-DD' })
  invoice_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100) // 对齐 customer_name 列宽
  customer_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @IsArray()
  @ArrayNotEmpty({ message: '请至少填写一行款项(款号+金额)' })
  @ValidateNested({ each: true })
  @Type(() => ExportInvoiceItemDto)
  items: ExportInvoiceItemDto[];
}
