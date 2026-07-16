// [Backend] src/orders/orders.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-06-24.dahlia',
  });

  constructor(private prisma: PrismaService) {}

  async create(createOrderDto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.settings.findUnique({ where: { id: 'GLOBAL' } });
      if (settings) {
        if (!settings.isAcceptingOrders) throw new BadRequestException("The trailer is currently closed.");
        if (!settings.overrideOpen) {
          const now = new Date();
          const currentHour = now.getHours().toString().padStart(2, '0');
          const currentMinute = now.getMinutes().toString().padStart(2, '0');
          const currentTime = `${currentHour}:${currentMinute}`;
          if (settings.openTime < settings.closeTime) {
            if (!(currentTime >= settings.openTime && currentTime <= settings.closeTime)) throw new BadRequestException("We are closed.");
          } else {
            if (!(currentTime >= settings.openTime || currentTime <= settings.closeTime)) throw new BadRequestException("We are closed.");
          }
        }
      }

      const inventoryNeeded = new Map<string, { invName: string; amountNeeded: number }>();
      let secureTotalAmount = 0;

      for (const item of createOrderDto.items) {
        const menuItem = await tx.menuItem.findFirst({
          where: { name: item.name },
          include: { inventoryItem: true },
        });

        if (!menuItem) throw new BadRequestException(`Item ${item.name} does not exist.`);
        if (!menuItem.isAvailable) throw new BadRequestException(`Item ${item.name} is currently out of stock.`);

        secureTotalAmount += (menuItem.price * item.quantity);

        if (menuItem.inventoryItemId && menuItem.inventoryItem && menuItem.inventoryDeduction) {
          const deduction = item.quantity * menuItem.inventoryDeduction;
          const invId = menuItem.inventoryItemId;

          if (inventoryNeeded.has(invId)) {
            inventoryNeeded.get(invId)!.amountNeeded += deduction;
          } else {
            inventoryNeeded.set(invId, { invName: menuItem.inventoryItem.name, amountNeeded: deduction });
          }
        }
      }

      for (const [invId, data] of inventoryNeeded.entries()) {
        const updateResult = await tx.inventoryItem.updateMany({
          where: { id: invId, currentStock: { gte: data.amountNeeded } },
          data: { currentStock: { decrement: data.amountNeeded } },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(`Not enough stock for ${data.invName}! Order aborted.`);
        }
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayCount = await tx.order.count({ where: { createdAt: { gte: startOfDay } } });
      const randomSuffix = Math.random().toString(36).substring(2, 4).toUpperCase();
      const generatedOrderNumber = `${(todayCount + 1).toString().padStart(3, '0')}-${randomSuffix}`;

      return tx.order.create({
        data: {
          orderNumber: generatedOrderNumber,
          totalAmount: secureTotalAmount,
          status: 'UNPAID',
          paymentMethod: createOrderDto.paymentMethod,
          items: {
            create: createOrderDto.items.map(item => ({
              name: item.name, quantity: item.quantity,
            })),
          },
        },
        include: { items: true },
      });
    });
  }

  async findActive() { return this.prisma.order.findMany({ where: { status: { in: ['PENDING', 'PREPARING'] } }, include: { items: true }, orderBy: { createdAt: 'asc' } }); }
  async findUnpaid() { return this.prisma.order.findMany({ where: { status: 'UNPAID', paymentMethod: 'CASH' }, include: { items: true }, orderBy: { createdAt: 'asc' } }); }
  async findCompleted() {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    return this.prisma.order.findMany({ where: { status: 'COMPLETED', updatedAt: { gte: startOfDay } }, include: { items: true }, orderBy: { updatedAt: 'desc' } });
  }

  async getStatusById(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, select: { id: true, orderNumber: true, status: true, totalAmount: true, updatedAt: true } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async markPaid(id: string) {
    const result = await this.prisma.order.updateMany({
      where: { id, status: 'UNPAID', paymentMethod: 'CASH' },
      data: { status: 'PENDING' },
    });
    if (result.count === 0) throw new ConflictException('Order cannot be marked paid. It may not be a Cash order or is not UNPAID.');
    return { success: true };
  }

  async startOrder(id: string) {
    const result = await this.prisma.order.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'PREPARING' },
    });
    if (result.count === 0) throw new ConflictException('Order is not PENDING.');
    return { success: true };
  }

  async completeOrder(id: string) {
    const result = await this.prisma.order.updateMany({
      where: { id, status: 'PREPARING' },
      data: { status: 'COMPLETED' },
    });
    if (result.count === 0) throw new ConflictException('Order is not PREPARING.');
    return { success: true };
  }

  async revertOrder(id: string) {
    const result = await this.prisma.order.updateMany({
      where: { id, status: 'COMPLETED' },
      data: { status: 'PREPARING' },
    });
    if (result.count === 0) throw new ConflictException('Order is not COMPLETED.');
    return { success: true };
  }

  async cancelOrder(id: string) {
    // SECURITY FIX: Read the order items INSIDE the transaction to guarantee data integrity!
    let paymentMethod = '';
    let stripePaymentId: string | null = null;
    let status = '';

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new NotFoundException('Order not found');
      
      paymentMethod = order.paymentMethod;
      stripePaymentId = order.stripePaymentId;
      status = order.status;

      if (order.status !== 'PENDING' && order.status !== 'UNPAID') {
        throw new ConflictException('Cannot cancel order that is already preparing or completed.');
      }

      const result = await tx.order.updateMany({
        where: { id, status: { in: ['PENDING', 'UNPAID'] } },
        data: { status: 'CANCELLED' }
      });
      
      if (result.count === 0) throw new ConflictException('Race condition detected. Order cancellation aborted.');

      for (const item of order.items) {
        const menuItem = await tx.menuItem.findFirst({ where: { name: item.name } });
        if (menuItem && menuItem.inventoryItemId && menuItem.inventoryDeduction) {
          await tx.inventoryItem.update({
            where: { id: menuItem.inventoryItemId },
            data: { currentStock: { increment: item.quantity * menuItem.inventoryDeduction } },
          });
        }
      }
    });

    // Process Stripe Refund OUTSIDE the DB transaction!
    if (paymentMethod === 'CARD' && stripePaymentId && status === 'PENDING') {
      try {
        await this.stripe.refunds.create({ payment_intent: stripePaymentId });
        this.logger.log(`Stripe refund successful for order ${id}`);
      } catch (err: any) {
        this.logger.error(`Stripe Refund Failed for order ${id}: ${err.message}`);
      }
    }

    return { success: true };
  }

  async cancelUnpaidOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.status !== 'UNPAID') return { success: false };
    await this.cancelOrder(order.id);
    return { success: true };
  }

  // --- STRIPE ---
  async createStripeCheckout(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.status !== 'UNPAID' || order.paymentMethod !== 'CARD') {
      throw new ConflictException('Invalid order for Stripe checkout.');
    }

    if (order.stripeSessionUrl) {
      return { url: order.stripeSessionUrl };
    }

    const lineItems = order.items.map((item) => {
      const unitAmount = Math.round((order.totalAmount / order.items.reduce((sum, i) => sum + i.quantity, 0)) * 100); 
      return { price_data: { currency: 'ron', product_data: { name: item.name }, unit_amount: unitAmount }, quantity: item.quantity };
    });

    const redirectUrl = process.env.CUSTOMER_URL || 'http://localhost:3000';
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      metadata: { orderId: order.id },
      success_url: `${redirectUrl}?success=true&orderId=${order.id}`,
      cancel_url: `${redirectUrl}?canceled=true&orderId=${order.id}`,
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: { stripeSessionUrl: session.url }
    });

    return { url: session.url };
  }

  async handleStripeWebhook(signature: string, rawBody: Buffer) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event: Stripe.Event;
    
    try { 
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret!); 
    } catch (err: any) { 
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException(`Webhook Error: ${err.message}`); 
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      const paymentIntentId = session.payment_intent as string;

      if (orderId) {
        try {
          const result = await this.prisma.order.updateMany({
            where: { id: orderId, status: 'UNPAID' },
            data: { status: 'PENDING', stripePaymentId: paymentIntentId },
          });

          // SECURITY FIX: Alert us if the payment was successful, but the order couldn't be updated!
          if (result.count === 0) {
            this.logger.error(`[CRITICAL] Stripe payment succeeded for order ${orderId}, but order was NOT UNPAID in the database! Needs manual reconciliation.`);
          } else {
            this.logger.log(`Order ${orderId} successfully marked as PENDING from Stripe Webhook.`);
          }
        } catch (dbError: any) {
          this.logger.error(`Database error while processing webhook for order ${orderId}: ${dbError.message}`);
          throw new Error('Database error during webhook processing'); // Forces Stripe to retry later!
        }
      }
    }
    return { received: true };
  }
}
