// src/auth/auth.controller.ts
import { Controller, Post, Body, Request, Patch } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: Record<string, string>) {
    return this.authService.login(body.username, body.password);
  }
  @Patch('password')
  changePassword(@Request() req, @Body() body: Record<string, string>) {
    // req.user comes from our JwtAuthGuard!
    return this.authService.changePassword(req.user.sub, body.oldPassword, body.newPassword);
  }
}