import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@i9/types';
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

    const hasRole = requiredRoles.some((role) => user.role === role);
    if (!hasRole) {
      throw new ForbiddenException(`需要权限：${requiredRoles.join(' 或 ')}`);
    }
    return true;
  }
}
