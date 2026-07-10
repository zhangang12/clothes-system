import { IsOptional, IsString, IsNumber, IsPositive, IsBoolean, MaxLength } from 'class-validator';

export class ConfirmShipDto {
  @IsOptional()
  @IsString()
  remark?: string;

  // 物流必填（总览走查P1#16 决议:物流信息须填）
  @IsString()
  @MaxLength(50)
  express_company: string;

  @IsString()
  @MaxLength(50)
  express_no: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  attach_url?: string;

  // 本次实发数量必填（总览走查P1#16 决议:数量必填，批次累计）
  @IsNumber()
  @IsPositive()
  qty: number;

  // 超合同量确认（累计已发 + 本次 > 合同量时必须为 true 才放行）
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
