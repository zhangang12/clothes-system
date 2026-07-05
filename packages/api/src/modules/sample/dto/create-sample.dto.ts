import {
  IsString, IsOptional, IsInt, IsNumber, IsArray, MaxLength, ValidateNested,
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

export class CreateSampleDto {
  @ApiPropertyOptional({ description: '样衣类别（7 类多选，逗号分隔）' })
  @IsOptional() @IsString() @MaxLength(100) categories?: string;

  @ApiProperty({ description: '中间商客户ID' })
  @Type(() => Number) @IsInt() middlemanId: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() customerId?: number;

  @ApiProperty({ example: 'H-2026-S001', description: '客户款号（必填）' })
  @IsString() @MaxLength(100) styleNo: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() buyerId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() patternmakerId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) patternmakerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) maker?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shipSampleDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) recipient?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) fileLocation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() garmentRemark?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) image1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) image2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) image3?: string;

  @ApiPropertyOptional({ type: [SampleMaterialDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SampleMaterialDto)
  materials?: SampleMaterialDto[];
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
}

export class ShipSampleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() shipSampleDate?: string;
}
