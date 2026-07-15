// [Backend] src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // THE SILVER BULLET CORS FIX:
  // "origin: true" tells NestJS to dynamically reflect the request's origin back to it.
  // This completely eliminates typo issues in Render environment variables!
  app.enableCors({
    origin: true, 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Backend is running on port: ${port}`);
}
bootstrap();
