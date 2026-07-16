import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentApprovalStatus } from '@i9/types';

// 付款申请列表检索（原为 controller 散参，收敛为 DTO 以便加 reconcile_id 反查）。
// 注意：日期/状态字段一律 @IsString() 而非 @IsDateString()/@IsEnum()——现有前端清空筛选项时
// 会把空串 '' 发上来（el-select clearable / 未选日期区间），空串过不了 IsDateString/IsEnum 会 400；
// service 侧对这些字段是 falsy 即忽略，故保持宽松校验以维持既有行为不变。
export class QueryPaymentRequestDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  factory_id?: number;

  @ApiPropertyOptional({ enum: PaymentApprovalStatus })
  @IsOptional()
  @IsString()
  approval_status?: PaymentApprovalStatus;

  // 单据反查（关联单据 chip）：对账单 → 由其发起的付款申请
  @ApiPropertyOptional({ description: '按关联对账单反查付款申请' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reconcile_id?: number;

  @ApiPropertyOptional({ description: '申请日期起（含）' })
  @IsOptional()
  @IsString()
  start_date?: string;

  @ApiPropertyOptional({ description: '申请日期止（含）' })
  @IsOptional()
  @IsString()
  end_date?: string;

  @ApiPropertyOptional({ description: '到期日起（含）' })
  @IsOptional()
  @IsString()
  due_start?: string;

  @ApiPropertyOptional({ description: '到期日止（含）' })
  @IsOptional()
  @IsString()
  due_end?: string;

  @ApiPropertyOptional({ description: '实际付款日起（含）' })
  @IsOptional()
  @IsString()
  paid_start?: string;

  @ApiPropertyOptional({ description: '实际付款日止（含）' })
  @IsOptional()
  @IsString()
  paid_end?: string;
}
