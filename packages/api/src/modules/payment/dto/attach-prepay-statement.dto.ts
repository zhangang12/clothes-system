import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// 预付款挂对账单附件（#145）。原来 @Body('statement_url') 取裸字符串不过校验（B136 同类：无长度校验），
// 列宽 VARCHAR(1000)，超长直接 Data too long 500。空串=清除，故 IsOptional 且不设 IsNotEmpty。
export class AttachPrepayStatementDto {
  @ApiPropertyOptional({ description: '对账单附件，多份逗号分隔；传空串清除' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  statement_url?: string;
}
