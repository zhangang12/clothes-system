import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

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

    response.status(status).json({
      code,
      msg: message,
      data: null,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
