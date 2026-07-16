import {
  IsString, IsNotEmpty, IsOptional, IsInt, IsNumber, IsArray, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SampleMaterialDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() id?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() arrangeDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) itemName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) width?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) colors?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) part?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) composition?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) codeBand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) zipperLength?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) puller?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() qty?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) size?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() refPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() actualUsage?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() supplierId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) supplierName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) image?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) remark?: string;
}

export class SampleShipRoundDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @ApiPropertyOptional({ description: '轮次' }) @IsOptional() @Type(() => Number) @IsInt() roundNo?: number;
  @ApiPropertyOptional({ description: '样衣尺码' }) @IsOptional() @IsString() @MaxLength(50) size?: string;
  @ApiPropertyOptional({ description: '数量(件)' }) @IsOptional() @Type(() => Number) @IsInt() qty?: number;
  @ApiPropertyOptional({ description: '寄样日期' }) @IsOptional() @IsString() shipDate?: string;
  @ApiPropertyOptional({ description: '寄样单号' }) @IsOptional() @IsString() @MaxLength(50) shipNo?: string;
  @ApiPropertyOptional({ description: '寄回日期' }) @IsOptional() @IsString() returnDate?: string;
  @ApiPropertyOptional({ description: '工价单价(版师)' }) @IsOptional() @Type(() => Number) @IsNumber() laborUnitPrice?: number;
  @ApiPropertyOptional({ description: '工价金额=数量×单价' }) @IsOptional() @Type(() => Number) @IsNumber() laborAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) remark?: string;
}

export class CreateSampleDto {
  @ApiProperty({ description: '样衣类别（7 类多选，逗号分隔，必填）' })
  @IsString() @IsNotEmpty() @MaxLength(100) categories: string;

  @ApiProperty({ description: '中间商客户ID' })
  @Type(() => Number) @IsInt() middlemanId: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() customerId?: number;

  @ApiProperty({ example: 'H-2026-S001', description: '客户款号（必填）' })
  @IsString() @MaxLength(100) styleNo: string;

  @ApiPropertyOptional({ description: '样衣尺码（如 38码 / S/M/L）' })
  @IsOptional() @IsString() @MaxLength(100) sampleSize?: string;

  @ApiPropertyOptional({ description: '样衣数量（件）' })
  @IsOptional() @Type(() => Number) @IsInt() sampleQty?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() buyerId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() patternmakerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) patternmakerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) maker?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shipSampleDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) recipient?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) fileLocation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() garmentRemark?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) image1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) image2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) image3?: string;

  @ApiPropertyOptional({ description: '样衣意见附件（客户反馈图/PDF，多文件逗号分隔）' })
  @IsOptional() @IsString() @MaxLength(500) feedbackAttachments?: string;

  @ApiPropertyOptional({ type: [SampleMaterialDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SampleMaterialDto)
  materials?: SampleMaterialDto[];

  @ApiPropertyOptional({ type: [SampleShipRoundDto], description: '寄样多轮跟踪(工价合计Σ回填供对账)' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SampleShipRoundDto)
  shipRounds?: SampleShipRoundDto[];
}

// 推送版师（业务：指派制版师 / 填材料寄出单号 → 打样中）
export class PushPatternmakerDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() patternmakerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) patternmakerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) materialShipNo?: string;
}

// 版师视图保存（仅：实际耗用/拉链长度 + 寄回单号 + 件数 + 工时单价）
export class PatternmakerSaveDto {
  @ApiPropertyOptional({ type: [SampleMaterialDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SampleMaterialDto)
  materials?: SampleMaterialDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) returnNo?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() pieceCount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() laborUnitPrice?: number;

  @ApiPropertyOptional({ type: [SampleShipRoundDto], description: '版师按轮填工价' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SampleShipRoundDto)
  shipRounds?: SampleShipRoundDto[];

  @ApiPropertyOptional({ description: '样衣意见附件（客户反馈图/PDF，多文件逗号分隔）' })
  @IsOptional() @IsString() @MaxLength(500) feedbackAttachments?: string;
}

// 历史样衣批量导入（CSV：客户款号,样衣类别,中间商名称,制版师,制单人,材料品名(分号分隔)）
export class ImportSampleRowDto {
  @ApiProperty({ description: '客户款号' })
  @IsString() @IsNotEmpty() @MaxLength(100) styleNo: string;

  @ApiProperty({ description: '样衣类别（逗号分隔）' })
  @IsString() @IsNotEmpty() @MaxLength(100) categories: string;

  @ApiProperty({ description: '中间商名称（精确匹配客户资料）' })
  @IsString() @IsNotEmpty() @MaxLength(100) middlemanName: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) patternmakerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) maker?: string;

  @ApiProperty({ description: '材料品名（分号分隔，至少 1 个）' })
  @IsString() @IsNotEmpty() materials: string;
}

export class ImportSampleDto {
  @ApiProperty({ type: [ImportSampleRowDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ImportSampleRowDto)
  rows: ImportSampleRowDto[];
}

export class ShipSampleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() shipSampleDate?: string;
}
