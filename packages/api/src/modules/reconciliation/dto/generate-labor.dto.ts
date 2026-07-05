import { IsArray, ArrayNotEmpty, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// 样衣打样工时对账：业务自由勾选多款样衣，合并生成一张工时对账单（设计稿 样衣确认清单·工时对账多款合并）
export class GenerateLaborDto {
  @ApiProperty({ type: [Number], description: '勾选的样衣 ID（须同一版师、均为已对账状态）' })
  @IsArray() @ArrayNotEmpty() @Type(() => Number) @IsInt({ each: true })
  sampleIds: number[];
}
