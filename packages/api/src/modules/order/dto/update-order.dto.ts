import { PartialType } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateOrderDto } from './create-order.dto';

// B006：PUT /orders/:id 原来用 `Partial<CreateOrderDto>` 接 body——TS 的 Partial<> 编译后 metatype 是 Object，
// 全局 ValidationPipe 对 Object 直接跳过，whitelist/forbidNonWhitelisted/类型校验整体失效（字符串金额、
// 非法枚举、超长文本直接落到 MySQL 变 500 或写脏数据）。PartialType 继承 CreateOrderDto 的全部校验/转换元数据，
// 并把每个字段置为可选（先例 contract/dto/update-contract.dto.ts）。前端 OrderEditView.buildDto 发的字段
// 全部在 CreateOrderDto 里（新建走同一份 buildDto），不存在「缺字段导致 400」。
export class UpdateOrderDto extends PartialType(CreateOrderDto) {}

// PATCH /orders/:id/matrix 原来是内联类型 `{ matrix_data: Record<string, unknown> }`，同样被管道跳过
export class UpdateMatrixDto {
  @ApiProperty({ description: '尺码数量搭配矩阵 JSON（{pos:[…], rows:[…]}）' })
  @IsObject()
  matrix_data: Record<string, unknown>;
}
