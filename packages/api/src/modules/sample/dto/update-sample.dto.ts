import { PartialType } from '@nestjs/swagger';
import { CreateSampleDto } from './create-sample.dto';

// 样衣编辑体（B006 同类）：原来 controller 用 Partial<CreateSampleDto> 接 body，
// 全局 ValidationPipe 对 Partial<> 这类非 class 元类型整体跳过，等于零校验、whitelist 也不生效。
// 字段集与 CreateSampleDto 完全一致(前端 SampleEditView.buildDto 建/改共用同一份，材料行字段已在 SampleMaterialDto 全部声明)，仅全部转可选。
export class UpdateSampleDto extends PartialType(CreateSampleDto) {}
