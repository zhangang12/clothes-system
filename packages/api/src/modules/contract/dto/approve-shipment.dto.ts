import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 发货批次审批（B118，2026-09-20 审查）：approve 必须是真布尔。
 * 此前是 `@Body('approve') approve: boolean`——原始类型不经 ValidationPipe 转换/校验，
 * 字符串 "false" 走到 `approve !== false` 被判成通过，批次被误审批。
 * 不传 = 通过（与前端一直以来的调用口径一致）。
 */
export class ApproveShipmentDto {
  @ApiPropertyOptional({ description: 'true/不传=审批通过，false=驳回' })
  @IsOptional()
  @IsBoolean()
  approve?: boolean;
}
