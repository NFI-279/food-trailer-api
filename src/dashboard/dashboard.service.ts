// src/dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    // 1. Get the start of today to filter today's orders
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // 2. Fetch all orders created today
    const todayOrders = await this.prisma.order.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
        },
      },
    });

    // 3. Calculate Revenue & Total Orders
    const ordersToday = todayOrders.length;
    const revenueToday = todayOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // 4. Count Active Orders
    const activeOrders = await this.prisma.order.count({
      where: { status: 'ACTIVE' },
    });

    // 5. Count Low Stock Items
    // (We fetch them and compare currentStock to threshold)
    const inventory = await this.prisma.inventoryItem.findMany();
    const lowStockItems = inventory.filter(
      (item) => item.currentStock <= item.lowStockThreshold
    ).length;

    return {
      revenueToday,
      ordersToday,
      activeOrders,
      lowStockItems,
    };
  }

  // Get chart data for the last 7 days
  async getAnalytics() {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0); // Start of 7 days ago

    // Fetch all orders from the last 7 days
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: {
          gte: sevenDaysAgo,
          lte: today,
        },
      },
    });

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const chartData: { day: string; revenue: number; orders: number }[] = [];

    // Loop backwards to create an array of the last 7 days in order
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date();
      targetDate.setDate(today.getDate() - i);
      const dayName = daysOfWeek[targetDate.getDay()];

      // Filter orders that happened exactly on this targetDate
      const dailyOrders = orders.filter(o => 
        o.createdAt.getDate() === targetDate.getDate() && 
        o.createdAt.getMonth() === targetDate.getMonth()
      );
      
      const revenue = dailyOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      
      chartData.push({
        day: dayName,
        revenue,
        orders: dailyOrders.length,
      });
    }

    return chartData;
  }
}