import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class MarkPaidDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  slip_url: string;
}
