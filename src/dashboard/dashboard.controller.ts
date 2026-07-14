// src/dashboard/dashboard.controller.ts
import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Roles } from '../auth/roles.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

   @Roles('ADMIN')
  @Get()
  getStats() {
    return this.dashboardService.getStats();
  }

   @Roles('ADMIN')
  @Get('chart')
  getAnalytics() {
    return this.dashboardService.getAnalytics();
  }
}
