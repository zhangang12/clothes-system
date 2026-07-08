import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  // 全局前缀
  app.setGlobalPrefix('api/v1');

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 全局异常过滤器改由 ErrorLogModule 以 APP_FILTER 注册(带 DI,自动归档服务器异常)

  // 全局响应拦截器
  app.useGlobalInterceptors(new ResponseInterceptor());

  // CORS（开发环境宽松，生产收紧）
  if (process.env.NODE_ENV === 'production' && !process.env.WEB_ORIGIN) {
    throw new Error('WEB_ORIGIN env var is required in production');
  }
  const corsOrigins: string[] | true = process.env.NODE_ENV === 'production'
    ? [process.env.WEB_ORIGIN!, ...(process.env.PORTAL_ORIGIN ? [process.env.PORTAL_ORIGIN] : [])]
    : true;
  app.enableCors({ origin: corsOrigins, credentials: true });

  // Swagger 文档
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('I9 服装制造管理系统 API')
      .setDescription('全模块 REST API 文档')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, doc);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 API 服务启动: http://localhost:${port}/api/v1`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📖 Swagger 文档: http://localhost:${port}/api-docs`);
  }
}

bootstrap();
