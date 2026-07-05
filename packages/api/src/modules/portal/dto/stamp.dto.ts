import { IsBoolean, Equals } from 'class-validator';

// 盖章前须勾选「已阅读并同意合同条款」（供应商门户设计稿 §B：盖章=电子签约的意思表示）
export class StampDto {
  @IsBoolean({ message: '请确认是否同意合同条款' })
  @Equals(true, { message: '请先阅读并勾选「已阅读并同意合同条款」后再盖章' })
  agreed: boolean;
}
