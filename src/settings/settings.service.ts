// src/settings/settings.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  // Get the global settings (create them if they don't exist)
  async getSettings() {
    let settings = await this.prisma.settings.findUnique({
      where: { id: 'GLOBAL' },
    });

    if (!settings) {
      settings = await this.prisma.settings.create({
        data: { id: 'GLOBAL' },
      });
    }

    return settings;
  }

  // Update the settings
  async updateSettings(updateData: any) {
    // Ensure the row exists first
    await this.getSettings();

    return this.prisma.settings.update({
      where: { id: 'GLOBAL' },
      data: updateData,
    });
  }
}