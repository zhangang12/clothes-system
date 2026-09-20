import { PartialType } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsInt, IsOptional, IsBoolean, IsString, MaxLength, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateCustomerDto } from './create-customer.dto';

// B006：PUT /customers/:id 原来用 Partial<CreateCustomerDto> 接 body——TS 类型在运行时是 Object，
// 全局 ValidationPipe 整体跳过（长度/枚举/嵌套子表全不校验）。PartialType 继承全部校验规则并逐字段加 @IsOptional，
// 与前端 CustomerEditView.buildDto 实际发送的字段一一对得上（已核对：全部在 CreateCustomerDto 里）。
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

// B006：POST /customers/grants 原来是内联类型，同样零校验。
// 前端 CustomerListView 发 { customer_ids, user_ids, can_edit, expire_at?, remark? }；
// id 来自列表行（bigint 列经 TypeORM 回来是字符串），@Type(() => Number) 逐元素转数字再校验。
export class GrantBatchDto {
  @ApiProperty({ type: [Number] })
  @IsArray() @ArrayNotEmpty() @Type(() => Number) @IsInt({ each: true })
  customer_ids: number[];

  @ApiProperty({ type: [Number] })
  @IsArray() @ArrayNotEmpty() @Type(() => Number) @IsInt({ each: true })
  user_ids: number[];

  @ApiPropertyOptional({ description: 'true=可修改；默认仅查看' })
  @IsOptional() @IsBoolean()
  can_edit?: boolean;

  @ApiPropertyOptional({ description: '有效期至 YYYY-MM-DD；不传=永久' })
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '有效期格式须为 YYYY-MM-DD' })
  expire_at?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(200)
  remark?: string;
}
