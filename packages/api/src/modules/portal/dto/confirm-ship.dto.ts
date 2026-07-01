import { IsOptional, IsString } from 'class-validator';

export class ConfirmShipDto {
  @IsOptional()
  @IsString()
  remark?: string;
}
