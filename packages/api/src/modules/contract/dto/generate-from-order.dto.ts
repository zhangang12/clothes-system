import { IsArray, IsInt, IsOptional, Min, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** 分批下合同（#128）：勾选的订单材料行 id；不传 = 为尚未下单的材料行生成 */
export class GenerateFromOrderDto {
  @ApiPropertyOptional({ type: [Number], description: '只为这些订单材料行生成合同（分批下）；不传=为尚未生成过合同的行生成' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  material_ids?: number[];
}
