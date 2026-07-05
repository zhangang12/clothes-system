import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyProfileDto {
  @ApiProperty({ example: '苏州XX服装制造有限公司' })
  @IsString() @MaxLength(100) name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) shortName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) taxNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) legalRep?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) remark?: string;

  @ApiPropertyOptional({ description: '设为默认主体（PDF/合同默认取此）' })
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
