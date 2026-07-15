// [Backend] src/orders/orders.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

@Injectable()
export class OrdersService {
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-06-24.dahlia',
  });

  constructor(private prisma: PrismaService) {}

  async create(createOrderDto: CreateOrderDto) {
    // Wrap EVERYTHING in a Database Transaction. If one thing fails, the whole block rolls back!
    return this.prisma.$transaction(async (tx) => {
      // 1. SECURITY & BUSINESS HOURS CHECK
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

      // 2. PRE-FLIGHT INVENTORY & PRICE CHECK
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

      // 3. ATOMIC INVENTORY DEDUCTION (Prevents negative stock race conditions)
      for (const [invId, data] of inventoryNeeded.entries()) {
        const updateResult = await tx.inventoryItem.updateMany({
          where: { id: invId, currentStock: { gte: data.amountNeeded } }, // Must have enough stock!
          data: { currentStock: { decrement: data.amountNeeded } },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(`Not enough stock for ${data.invName}! Order aborted.`);
        }
      }

      // 4. GENERATE SEQUENTIAL ORDER NUMBER
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayCount = await tx.order.count({ where: { createdAt: { gte: startOfDay } } });
      const randomSuffix = Math.random().toString(36).substring(2, 4).toUpperCase();
      const generatedOrderNumber = `${(todayCount + 1).toString().padStart(3, '0')}-${randomSuffix}`;

      // 5. SAVE ORDER
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

  async getStatusByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber }, select: { orderNumber: true, status: true, totalAmount: true, updatedAt: true } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // --- STRICT STATE MACHINE WORKFLOW ---

  async markPaid(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (order?.status !== 'UNPAID') throw new ConflictException('Order is not in UNPAID state.');
    return this.prisma.order.update({ where: { id }, data: { status: 'PENDING' } });
  }

  async startOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (order?.status !== 'PENDING') throw new ConflictException('Can only start PENDING orders.');
    return this.prisma.order.update({ where: { id }, data: { status: 'PREPARING' } });
  }

  async completeOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (order?.status !== 'PREPARING') throw new ConflictException('Can only complete PREPARING orders.');
    return this.prisma.order.update({ where: { id }, data: { status: 'COMPLETED' } });
  }

  async revertOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (order?.status !== 'COMPLETED') throw new ConflictException('Can only revert COMPLETED orders.');
    return this.prisma.order.update({ where: { id }, data: { status: 'PREPARING' } });
  }

  async cancelOrder(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== 'PENDING' && order.status !== 'UNPAID') throw new ConflictException('Cannot cancel order that is already preparing or completed.');

      // Stripe Refund
      if (order.paymentMethod === 'CARD' && order.stripePaymentId && order.status === 'PENDING') {
        try { await this.stripe.refunds.create({ payment_intent: order.stripePaymentId }); } 
        catch (err: any) { throw new BadRequestException("Stripe refund failed. Refund manually."); }
      }

      // Refund Inventory Atomically
      for (const item of order.items) {
        const menuItem = await tx.menuItem.findFirst({ where: { name: item.name } });
        if (menuItem && menuItem.inventoryItemId && menuItem.inventoryDeduction) {
          await tx.inventoryItem.update({
            where: { id: menuItem.inventoryItemId },
            data: { currentStock: { increment: item.quantity * menuItem.inventoryDeduction } },
          });
        }
      }

      return tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
  }

  async cancelUnpaidOrder(orderNumber: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber } });
    if (!order || order.status !== 'UNPAID') return { success: false };
    await this.cancelOrder(order.id);
    return { success: true };
  }

  // --- STRIPE ---
  async createStripeCheckout(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.status !== 'UNPAID' || order.paymentMethod !== 'CARD') throw new ConflictException('Invalid order for Stripe checkout.');

    const lineItems = order.items.map((item) => {
      const unitAmount = Math.round((order.totalAmount / order.items.reduce((sum, i) => sum + i.quantity, 0)) * 100); 
      return { price_data: { currency: 'ron', product_data: { name: item.name, description: item.notes || 'No notes' }, unit_amount: unitAmount }, quantity: item.quantity };
    });

    const redirectUrl = process.env.CUSTOMER_URL || 'http://localhost:3000';
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      metadata: { orderId: order.id },
      success_url: `${redirectUrl}?success=true`,
      cancel_url: `${redirectUrl}?canceled=true`,
    });

    return { url: session.url };
  }

  async handleStripeWebhook(signature: string, rawBody: Buffer) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event: Stripe.Event;
    try { event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret!); } 
    catch (err: any) { throw new BadRequestException(`Webhook Error: ${err.message}`); }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      const paymentIntentId = session.payment_intent as string;

      if (orderId) {
        // IDEMPOTENCY: Only update if it's currently UNPAID
        await this.prisma.order.updateMany({
          where: { id: orderId, status: 'UNPAID' },
          data: { status: 'PENDING', stripePaymentId: paymentIntentId },
        });
      }
    }
    return { received: true };
  }
}