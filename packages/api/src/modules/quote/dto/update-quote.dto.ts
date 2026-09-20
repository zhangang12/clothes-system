import { PartialType } from '@nestjs/swagger';
import { CreateQuoteDto } from './create-quote.dto';

// 报价编辑体（B006 同类）：原来 controller 用 Partial<CreateQuoteDto> 接 body，
// 全局 ValidationPipe 对 Partial<> 这类非 class 元类型整体跳过，等于零校验、whitelist 也不生效。
// 字段集与 CreateQuoteDto 完全一致(前端 QuoteEditView.buildDto 建/改共用同一份)，仅全部转可选。
export class UpdateQuoteDto extends PartialType(CreateQuoteDto) {}
