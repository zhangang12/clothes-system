import { IsString, IsEnum, IsOptional, MaxLength, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerGrade } from '@i9/types';

export class CreateCustomerDto {
  @ApiProperty({ example: '美国ABC时装公司' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  short_name?: string;

  @ApiProperty({ enum: CustomerGrade, example: CustomerGrade.B })
  @IsEnum(CustomerGrade)
  grade: CustomerGrade;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @MaxLength(5)
  currency: string;

  @ApiPropertyOptional({ example: 'T/T' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  payment_method?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contact_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  contact_email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}
