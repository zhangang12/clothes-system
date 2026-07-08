import { IsString, IsOptional, IsArray, MaxLength, MinLength } from 'class-validator';

export class CreateFeedbackDto {
  @IsString()
  @MinLength(1, { message: '请填写问题描述' })
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[]; // 图片 URL 数组(经 /uploads 上传)

  @IsOptional()
  @IsString()
  @MaxLength(255)
  page_url?: string;
}
