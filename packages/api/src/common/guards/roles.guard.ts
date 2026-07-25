import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, isAdminRole } from '@i9/types';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('未登录');

    // 供应商门户 token 不得访问任何管理端接口（即使该接口未声明 @Roles）
    if (user.type === 'supplier') {
      throw new ForbiddenException('供应商账号无权访问管理端');
    }

    if (!requiredRoles || requiredRoles.length === 0) return true;

    // SUPERVISOR 权限视同 ADMIN（2026-07-22 用户拍板）：凡放行 ADMIN 的端点主管均可访问
    const hasRole = requiredRoles.some(
      (role) => user.role === role || (role === UserRole.ADMIN && isAdminRole(user.role)),
    );
    if (!hasRole) {
      throw new ForbiddenException(`需要权限：${requiredRoles.join(' 或 ')}`);
    }
    return true;
  }
}
