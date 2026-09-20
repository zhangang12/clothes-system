import { PartialType } from '@nestjs/swagger';
import { CreatePaymentRequestDto } from './create-payment-request.dto';

// 改草稿付款申请（B006/B011）：此前控制器用 Partial<CreatePaymentRequestDto> 接 body，
// 全局 ValidationPipe 对 TS 泛型类型整体跳过——prepay_offset 负数、amount 非数字都能原样进 service。
// 真 DTO 让 @Min(0)/@IsNumber 生效；字段集与前端 PaymentListView.doCreatePR 发的完全一致（type/factory_id/
// reconcile_id/amount/prepay_offset/description/bank_*/related_style_no/invoice_no/invoice_url 都在 Create 里）。
export class UpdatePaymentRequestDto extends PartialType(CreatePaymentRequestDto) {}
