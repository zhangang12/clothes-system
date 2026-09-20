import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// 改草稿态对账单（B068）：此前控制器用内联类型接 body，全局 ValidationPipe 整体跳过——
// 税率发成空对象/字符串算出 NaN、或 99999 越 decimal(5,2) 列宽，都直接 500。
// 字段与前端 ReconciliationListView.editDraftForm 一一对应；前端清空数字框会发 null，
// @IsOptional 放行 null（后端约定 null = 清空、undefined = 不改）。
export class UpdateReconciliationDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(100) // 对齐 reconciliation.invoice_no 列宽
  invoice_no?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  invoice_amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100) // 与前端 :max=100 一致；decimal(5,2) 最大 999.99，再大直接 500
  tax_rate?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
