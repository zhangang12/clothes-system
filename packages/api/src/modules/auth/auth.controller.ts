import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, PortalLoginDto } from './dto/login.dto';

@ApiTags('认证')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ login: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: '管理端登录' })
  login(@Body() dto: LoginDto) {
    return this.authService.loginAdmin(dto.username, dto.password);
  }

  @Post('portal/login')
  @Throttle({ login: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: '供应商门户登录' })
  portalLogin(@Body() dto: PortalLoginDto) {
    return this.authService.loginSupplier(dto.username, dto.password);
  }
}
