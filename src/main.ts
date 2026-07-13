// [Backend] src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  
  // 1. Get the URLs from Render and remove any accidental spaces!
  const envOrigins = process.env.FRONTEND_URL 
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim()) 
    : [];

  // 2. ALWAYS allow localhost so you never get locked out during development
  const allowedOrigins = [
    ...envOrigins,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002'
  ];

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Strips away any fields hackers try to sneak in
    forbidNonWhitelisted: true,
  }));

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Backend is running on port: ${port}`);
}
bootstrap();
