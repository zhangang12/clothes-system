import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class SupplierGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (req.user?.type !== 'supplier') {
      throw new ForbiddenException('仅供应商账号可访问');
    }
    return true;
  }
}
