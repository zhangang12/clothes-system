import { IsOptional, IsString, IsNumber, IsPositive, IsBoolean, MaxLength, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ShipLineDto } from './merge-ship.dto';

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

  // 本次实发数量（未给逐物料行时必填；给了 items 则批次数量=Σ行,服务端校验）
  @IsOptional()
  @IsNumber()
  @IsPositive()
  qty?: number;

  // 逐物料行实发数（P3#30）
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShipLineDto)
  items?: ShipLineDto[];

  // 本批收货地址（默认带合同发货地址，可临时改，P3#31）
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ship_address?: string;

  // 超合同量确认（累计已发 + 本次 > 合同量时必须为 true 才放行）
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
