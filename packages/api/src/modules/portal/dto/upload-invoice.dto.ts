import { IsOptional, IsString, IsNumber } from 'class-validator';

export class UploadInvoiceDto {
  @IsOptional()
  @IsString()
  invoice_no?: string;

  @IsOptional()
  @IsNumber()
  invoice_amount?: number;

  @IsOptional()
  @IsString()
  invoice_url?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
