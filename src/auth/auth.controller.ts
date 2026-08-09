// src/auth/auth.controller.ts
import { Controller, Post, Body, Request, Patch, ForbiddenException } from '@nestjs/common';
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

    throw new ForbiddenException('Password changes are disabled in this demo environment.');
    //return this.authService.changePassword(req.user.sub, body.oldPassword, body.newPassword);
  }
}
