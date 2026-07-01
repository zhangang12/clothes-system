import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FactoryType } from '@i9/types';

export class CreateFactoryDto {
  @ApiProperty({ example: '上海某某面料有限公司' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: '上海某某' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  short_name?: string;

  @ApiProperty({ enum: FactoryType, example: FactoryType.MATERIAL })
  @IsEnum(FactoryType)
  type: FactoryType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contact_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contact_phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bank_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  bank_account?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tax_no?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}
