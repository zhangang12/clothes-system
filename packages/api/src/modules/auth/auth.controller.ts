import { Controller, Post, Get, Patch, Body, Query, Param, Request, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, PortalLoginDto } from './dto/login.dto';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto, ResetPasswordDto, UpdateSupplierDto } from './dto/account.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@i9/types';

const INTERNAL_ROLES = [
  UserRole.ADMIN, UserRole.BUSINESS, UserRole.FINANCE,
  UserRole.PATTERNMAKER, UserRole.SUPERVISOR, UserRole.SAMPLE_MAKER, UserRole.SHIPPING,
];

// 账号管理：管理员 + 主管（主管在 service 层受限——只能指派非管理角色、不能碰 ADMIN/SUPERVISOR 账号）
const ACCOUNT_MANAGERS = [UserRole.ADMIN, UserRole.SUPERVISOR];

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

  // ── 本人改密：任意登录用户（内部 or 供应商）改自己的密码，须验原密码 ──
  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改本人密码' })
  changePassword(@Body() dto: ChangePasswordDto, @Request() req: any) {
    return this.authService.changePassword(
      { id: req.user.id, type: req.user.type }, dto.old_password, dto.new_password,
    );
  }

  // ── 账号管理：内部用户（管理员+主管；主管在 service 层受限） ──
  @Get('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCOUNT_MANAGERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: '内部用户管理列表（含状态与菜单权限）' })
  adminListUsers() {
    return this.authService.adminListUsers();
  }

  @Post('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCOUNT_MANAGERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: '新建内部用户（主管限指派非管理角色）' })
  createUser(@Body() dto: CreateUserDto, @Request() req: any) {
    return this.authService.createUser(dto, req.user);
  }

  @Patch('admin/users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCOUNT_MANAGERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: '改用户姓名/角色/启停/菜单权限（主管不能碰管理角色账号）' })
  updateUser(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @Request() req: any) {
    return this.authService.updateUser(id, dto, req.user);
  }

  @Patch('admin/users/:id/password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCOUNT_MANAGERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: '重置用户密码（主管不能重置管理角色账号）' })
  resetUserPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto, @Request() req: any) {
    return this.authService.resetUserPassword(id, dto.new_password, req.user);
  }

  // ── 账号管理：供应商门户账号（管理员+主管；供应商账号无角色概念，无提权面） ──
  @Get('admin/suppliers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCOUNT_MANAGERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: '供应商门户账号列表' })
  adminListSuppliers() {
    return this.authService.adminListSuppliers();
  }

  @Patch('admin/suppliers/:id/password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCOUNT_MANAGERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: '重置供应商密码' })
  resetSupplierPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto) {
    return this.authService.resetSupplierPassword(id, dto.new_password);
  }

  @Patch('admin/suppliers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ACCOUNT_MANAGERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: '启停供应商账号' })
  updateSupplier(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierDto) {
    return this.authService.updateSupplier(id, dto.status ?? 1);
  }
}
