// [Backend] src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const envOrigins = process.env.FRONTEND_URL 
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim()) 
    : [];

  app.enableCors({
    // Instead of a static array, we use a secure validation function
    origin: (origin, callback) => {
      // 1. Allow requests with no origin (e.g., server-to-server or mobile apps)
      if (!origin) return callback(null, true);
      
      // 2. Check if it matches your Render ENV variables exactly
      if (envOrigins.includes(origin)) return callback(null, true);
      
      // 3. SECURE VERCEL FALLBACK: Allow any of your Vercel deployments!
      if (origin.endsWith('.vercel.app')) return callback(null, true);

      // 4. Reject everything else (Hackers, other websites)
      return callback(null, false);
    },
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
