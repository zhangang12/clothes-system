import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateContractDto } from './create-contract.dto';

// 合同编辑（设计稿 04-合同 v1.3 编辑页）：
// 类型/补料母合同/关联订单 创建后不可改；草稿可全改，推送后仅备注类可改（E5，service 层守卫）
export class UpdateContractDto extends PartialType(
  OmitType(CreateContractDto, ['type', 'parent_id', 'order_id'] as const),
) {}
