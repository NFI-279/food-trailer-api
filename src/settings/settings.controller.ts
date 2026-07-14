// src/settings/settings.controller.ts
import { Controller, Get, Patch, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { Public } from '../auth/public.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}
  
  @Public()
  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Roles('ADMIN')
  @Patch()
  updateSettings(@Body() updateData: any) {
    return this.settingsService.updateSettings(updateData);
  }
}
