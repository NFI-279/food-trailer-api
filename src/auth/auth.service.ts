// src/auth/auth.service.ts
import { Injectable, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService implements OnModuleInit{
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

   // --- ADD THIS BLOCK BACK IN ---
  async onModuleInit() {
    const existingAdmin = await this.prisma.user.findUnique({ where: { username: 'admin' } });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('foodtrailer2026', 10);
      await this.prisma.user.create({
        data: {
          username: 'admin',
          password: hashedPassword,
          role: 'ADMIN'
        },
      });
      console.log('✅ Admin account seeded!');
    }
  }
  // ------------------------------

  async login(username: string, pass: string) {
    // 1. Find the user
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Check if the password matches the encrypted hash
    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Generate the secure token
    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }

   async changePassword(userId: string, oldPass: string, newPass: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    // Verify old password
    const isMatch = await bcrypt.compare(oldPass, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Incorrect old password');
    }

    // Encrypt new password
    const hashedNewPassword = await bcrypt.hash(newPass, 10);

    // Save to DB
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return { message: 'Password updated successfully' };
  }
}
