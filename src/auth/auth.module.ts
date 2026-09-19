// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { getJwtSecret } from '../config/security.config';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: getJwtSecret(),
      signOptions: { expiresIn: '12h' }, // Token expires after a 12-hour shift!
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}