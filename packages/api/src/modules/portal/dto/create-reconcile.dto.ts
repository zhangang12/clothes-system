import { IsArray, ArrayNotEmpty, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// 我要对账（设计稿 05 v2.2 §C）：勾选已审批发货批次生成对账单
export class CreateReconcileDto {
  @ApiProperty({ description: '勾选的发货批次 id（须已通过业务审批且未被对账占用）', type: [Number] })
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  shipment_ids: number[];
}
