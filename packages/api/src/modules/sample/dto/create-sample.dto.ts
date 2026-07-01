import { IsString, IsOptional, IsInt, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSampleDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  customer_id: number;

  @ApiProperty({ example: '2024春季外套' })
  @IsString()
  @MaxLength(100)
  style_name: string;

  @ApiPropertyOptional({ example: '春季' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  season?: string;

  @ApiPropertyOptional({ example: '外套' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  process_req?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  patternmaker_id?: number;
}

export class AssignPatternmakerDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  patternmaker_id: number;
}

export class SubmitVersionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  attachments?: string[];
}

export class RejectSampleDto {
  @ApiProperty({ example: '领口比例不对，请重新打版' })
  @IsString()
  reject_reason: string;
}
