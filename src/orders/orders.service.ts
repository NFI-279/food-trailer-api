// src/orders/orders.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';


@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  // 1. Create a new order (with its nested items)
  async create(createOrderDto: CreateOrderDto) {
    // --- 1. SECURITY & BUSINESS HOURS CHECK ---
    const settings = await this.prisma.settings.findUnique({ where: { id: 'GLOBAL' } });
    
    if (settings) {
      if (!settings.isAcceptingOrders) {
        throw new BadRequestException("The trailer is currently closed. Cannot accept orders.");
      }

      if (!settings.overrideOpen) {
        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2, '0');
        const currentMinute = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${currentHour}:${currentMinute}`;

        const { openTime, closeTime } = settings;
        let isOpen = false;

        if (openTime < closeTime) {
          isOpen = currentTime >= openTime && currentTime <= closeTime;
        } else {
          isOpen = currentTime >= openTime || currentTime <= closeTime;
        }

        if (!isOpen) {
          throw new BadRequestException(`We are closed. Business hours are ${openTime} to ${closeTime}.`);
        }
      }
    }
    // --- END SECURITY CHECK ---

    // --- 2. PRE-FLIGHT INVENTORY CHECK ---
    // We aggregate the required inventory. (In case multiple menu items use the same inventory!)
    const inventoryNeeded = new Map<string, { invName: string; amountNeeded: number; amountInStock: number }>();

    for (const item of createOrderDto.items) {
      const menuItem = await this.prisma.menuItem.findFirst({
        where: { name: item.name },
        include: { inventoryItem: true }, // We include the linked inventory item so we know the current stock!
      });

      if (menuItem && menuItem.inventoryItemId && menuItem.inventoryItem && menuItem.inventoryDeduction) {
        const deduction = item.quantity * menuItem.inventoryDeduction;
        const invId = menuItem.inventoryItemId;

        if (inventoryNeeded.has(invId)) {
          inventoryNeeded.get(invId)!.amountNeeded += deduction;
        } else {
          inventoryNeeded.set(invId, {
            invName: menuItem.inventoryItem.name,
            amountNeeded: deduction,
            amountInStock: menuItem.inventoryItem.currentStock,
          });
        }
      }
    }

    // Now that we have the totals, verify if we have enough stock!
    for (const [invId, data] of inventoryNeeded.entries()) {
      if (data.amountInStock < data.amountNeeded) {
        // ABORT ORDER! Throw an error back to the frontend!
        throw new BadRequestException(
          `Not enough stock for ${data.invName}! We need ${data.amountNeeded}, but only have ${data.amountInStock} left.`
        );
      }
    }
    // --- END PRE-FLIGHT CHECK ---

    // --- 3. SAVE THE ORDER (Because we know it's safe!) ---
    const order = await this.prisma.order.create({
      data: {
        orderNumber: createOrderDto.orderNumber,
        totalAmount: createOrderDto.totalAmount,
        status: 'ACTIVE',
        items: {
          create: createOrderDto.items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            notes: item.notes,
          })),
        },
      },
      include: { items: true },
    });

    // --- 4. DEDUCT INVENTORY ---
    for (const [invId, data] of inventoryNeeded.entries()) {
      await this.prisma.inventoryItem.update({
        where: { id: invId },
        data: {
          currentStock: { decrement: data.amountNeeded },
        },
      });
    }

    return order;
  }

  

  // 2. Fetch only ACTIVE orders for the kitchen tablet
  async findActive() {
    return this.prisma.order.findMany({
      where: { status: 'ACTIVE' },
      include: { items: true }, // We need the items to display on the card!
      orderBy: { createdAt: 'asc' }, // Oldest first
    });
  }

  // 3. Mark an order as COMPLETED
  async completeOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
  }

  // 4. Fetch COMPLETED orders (only for today, newest first)
  async findCompleted() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return this.prisma.order.findMany({
      where: { 
        status: 'COMPLETED',
        updatedAt: { gte: startOfDay } // Only show ones completed today
      },
      include: { items: true },
      orderBy: { updatedAt: 'desc' }, // Show most recently completed at the top
    });
  }

  // 5. Revert a completed order back to ACTIVE
  async revertOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  // 6. Check order status (Public for customers)
  async getStatusByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      // Add updatedAt: true so the customer app knows exactly when it was finished!
      select: { orderNumber: true, status: true, totalAmount: true, updatedAt: true } 
    });

    if (!order) {
      throw new NotFoundException(`Order #${orderNumber} not found`);
    }

    return order;
  }
}
