import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorLogService } from '../../modules/error-log/error-log.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(@Optional() private readonly errorLog?: ErrorLogService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let code = 5000;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as { message?: string | string[] }).message instanceof Array
            ? ((exceptionResponse as { message: string[] }).message).join('; ')
            : (exceptionResponse as { message?: string }).message ?? message;

      // 业务状态码映射
      code = status === 401 ? 4001
           : status === 403 ? 4003
           : status === 404 ? 4004
           : status === 422 ? 1002
           : status === 400 ? 1001
           : status * 10;
    } else {
      this.logger.error(
        `未知异常 ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // 服务器异常(≥500)自动归档到系统报错记录(去重+上下文);fire-and-forget,不阻塞响应
    if (status >= 500 && this.errorLog) {
      const user = (request as any).user;
      void this.errorLog.record({
        method: request.method,
        path: request.originalUrl ?? request.url,
        statusCode: status,
        code,
        errorType: exception instanceof Error ? exception.constructor.name : typeof exception,
        message,
        stack: exception instanceof Error ? exception.stack : undefined,
        query: request.query,
        params: request.params,
        body: request.body,
        userId: user?.id,
        username: user?.username,
        ip: request.ip,
      });
    }

    response.status(status).json({
      code,
      msg: message,
      data: null,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
