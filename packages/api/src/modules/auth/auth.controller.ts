import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, PortalLoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';

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

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  @ApiBearerAuth()
  @ApiOperation({ summary: '内部用户清单（机密授权选人 / 制版师下拉，可按角色过滤）' })
  listUsers(@Query('role') role?: string) {
    return this.authService.listUsers(role);
  }
}
