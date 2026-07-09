import { IsOptional, IsString, IsNumber, IsPositive, IsBoolean, MaxLength } from 'class-validator';

export class ConfirmShipDto {
  @IsOptional()
  @IsString()
  remark?: string;

  // 物流与附件（设计稿 门户发货步：快递公司/单号 + 装箱单/货物照片）
  @IsOptional()
  @IsString()
  @MaxLength(50)
  express_company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  express_no?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  attach_url?: string;

  // 本次实发数量（批次累计；缺省时仅推进状态，兼容单批发货）
  @IsOptional()
  @IsNumber()
  @IsPositive()
  qty?: number;

  // 超合同量确认（累计已发 + 本次 > 合同量时必须为 true 才放行）
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
