// [Backend] src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateSecurityConfiguration } from './config/security.config';

async function bootstrap() {
  validateSecurityConfiguration();
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const allowedOrigins = [
    'https://food-trailer-customer.vercel.app',
    'https://food-trailer-admin-eight.vercel.app',
    'https://food.nfi279.dev',
    'https://admin.food.nfi279.dev',
  ];

  // Optional: allow extra origins through Render ENV without changing code.
  // Example:
  // FRONTEND_URL=https://food.nfi279.dev,https://admin.food.nfi279.dev
  const envOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL
        .split(',')
        .map((url) => url.trim())
        .filter((url) => {
          try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:' || parsed.hostname === 'localhost';
          } catch {
            return false;
          }
        })
    : [];

  const corsOrigins = [...new Set([...allowedOrigins, ...envOrigins])];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header.
      // This includes things such as server-to-server requests,
      // Postman/cURL and some non-browser clients.
      if (!origin) {
        return callback(null, true);
      }

      // Only allow explicitly trusted frontend origins.
      if (corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked origin: ${origin}`), false);
    },

    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT || 3001;

  await app.listen(port);

  console.log(`Backend is running on port: ${port}`);
}

bootstrap();
