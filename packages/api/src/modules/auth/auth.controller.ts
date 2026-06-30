import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString() username: string;
  @IsString() @MinLength(6) password: string;
}

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '管理端登录' })
  login(@Body() dto: LoginDto) {
    return this.authService.loginAdmin(dto.username, dto.password);
  }

  @Post('portal/login')
  @ApiOperation({ summary: '供应商门户登录' })
  portalLogin(@Body() dto: LoginDto) {
    return this.authService.loginSupplier(dto.username, dto.password);
  }
}
