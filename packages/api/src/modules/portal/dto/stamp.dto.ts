import { IsBoolean, Equals, IsOptional, IsString, MaxLength } from 'class-validator';

// 盖章前须勾选「已阅读并同意合同条款」（供应商门户设计稿 §B：盖章=电子签约的意思表示）
export class StampDto {
  @IsBoolean({ message: '请确认是否同意合同条款' })
  @Equals(true, { message: '请先阅读并勾选「已阅读并同意合同条款」后再盖章' })
  agreed: boolean;

  // 纸质盖章照片（A3）：上传则本次为纸质盖章留痕，否则为电子章
  @IsOptional()
  @IsString()
  @MaxLength(500)
  paper_url?: string;
}
