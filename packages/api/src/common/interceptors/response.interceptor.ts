import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface PageData<T> {
  items: T[];
  total: number;
  page?: number;
  size?: number;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T> {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        // 分页数据自动展开 total
        if (data && typeof data === 'object' && 'items' in data && 'total' in data) {
          const page = data as PageData<unknown>;
          return {
            code: 0,
            msg: 'ok',
            data: page.items,
            total: page.total,
            page: page.page,
            size: page.size,
          };
        }
        return {
          code: 0,
          msg: 'ok',
          data,
        };
      }),
    );
  }
}
