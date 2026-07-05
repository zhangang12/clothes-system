import { IsOptional, IsString, IsNumber, IsPositive, IsBoolean } from 'class-validator';

export class ConfirmShipDto {
  @IsOptional()
  @IsString()
  remark?: string;

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
