// [Backend] src/orders/orders.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger, UnauthorizedException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-06-24.dahlia',
  });

  constructor(private prisma: PrismaService) {}

  async create(createOrderDto: CreateOrderDto) {
    const customerAccessToken = randomBytes(32).toString('hex');
    const customerAccessTokenHash = this.hashCustomerAccessToken(customerAccessToken);

    const order = await this.prisma.$transaction(async (tx) => {
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
          customerAccessTokenHash,
          items: {
            create: createOrderDto.items.map(item => ({
              name: item.name, quantity: item.quantity,
            })),
          },
        },
        include: { items: true },
      });
    });

    const { customerAccessTokenHash: _, ...safeOrder } = order;
    return { ...safeOrder, customerAccessToken };
  }

  async findActive() { return this.prisma.order.findMany({ where: { status: { in: ['PENDING', 'PREPARING'] } }, include: { items: true }, orderBy: { createdAt: 'asc' } }); }
  async findUnpaid() { return this.prisma.order.findMany({ where: { status: 'UNPAID', paymentMethod: 'CASH' }, include: { items: true }, orderBy: { createdAt: 'asc' } }); }
  async findCompleted() {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    return this.prisma.order.findMany({ where: { status: 'COMPLETED', updatedAt: { gte: startOfDay } }, include: { items: true }, orderBy: { updatedAt: 'desc' } });
  }

  async getStatusById(id: string, customerAccessToken?: string) {
    await this.assertCustomerAccess(id, customerAccessToken);

    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, orderNumber: true, status: true, totalAmount: true, updatedAt: true },
    });
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
    // SECURITY FIX: Perform the DB transaction and capture the EXACT final state!
    const finalOrderState = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new NotFoundException('Order not found');
      
      if (order.status !== 'PENDING' && order.status !== 'UNPAID') {
        throw new ConflictException('Cannot cancel order that is already preparing or completed.');
      }

      const updatedOrder = await tx.order.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });

      // Refund Inventory
      for (const item of order.items) {
        const menuItem = await tx.menuItem.findFirst({ where: { name: item.name } });
        if (menuItem && menuItem.inventoryItemId && menuItem.inventoryDeduction) {
          await tx.inventoryItem.update({
            where: { id: menuItem.inventoryItemId },
            data: { currentStock: { increment: item.quantity * menuItem.inventoryDeduction } },
          });
        }
      }

      return { ...updatedOrder, items: order.items }; // Return the fresh data!
    });

    // SECURITY FIX: If the fresh data shows a Stripe ID, refund it instantly!
    if (finalOrderState.paymentMethod === 'CARD' && finalOrderState.stripePaymentId) {
      try {
        await this.stripe.refunds.create({ payment_intent: finalOrderState.stripePaymentId });
        this.logger.log(`Stripe refund successful for order ${id}`);
      } catch (err: any) {
        this.logger.error(`Stripe Refund Failed for order ${id}: ${err.message}`);
      }
    }

    return { success: true };
  }

  async cancelUnpaidOrder(id: string, customerAccessToken?: string) {
    await this.assertCustomerAccess(id, customerAccessToken);
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.status !== 'UNPAID') return { success: false };
    await this.cancelOrder(order.id);
    return { success: true };
  }

  // --- STRIPE ---
  async createStripeCheckout(orderId: string, customerAccessToken?: string) {
    await this.assertCustomerAccess(orderId, customerAccessToken);
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
          // Attempt to update the order only if it's still UNPAID
          const result = await this.prisma.order.updateMany({
            where: { id: orderId, status: 'UNPAID' },
            data: { status: 'PENDING', stripePaymentId: paymentIntentId },
          });

          if (result.count === 0) {
            // SECURITY FIX: The order wasn't UNPAID! Let's find out why.
            const existingOrder = await this.prisma.order.findUnique({ where: { id: orderId } });
            
            if (existingOrder?.status === 'CANCELLED') {
              // The customer paid, but the order was cancelled in the exact same millisecond!
              // Issue an immediate automatic refund!
              this.logger.warn(`Order ${orderId} was paid but is already CANCELLED. Issuing automatic refund!`);
              await this.stripe.refunds.create({ payment_intent: paymentIntentId });
              
              // Save the payment ID so we have a record of it being refunded
              await this.prisma.order.update({
                where: { id: orderId },
                data: { stripePaymentId: paymentIntentId }
              });
            } else {
              this.logger.error(`Stripe payment succeeded for order ${orderId}, but status was ${existingOrder?.status}.`);
            }
          } else {
            this.logger.log(`Order ${orderId} successfully marked as PENDING from Stripe Webhook.`);
          }
        } catch (dbError: any) {
          this.logger.error(`Database error while processing webhook for order ${orderId}: ${dbError.message}`);
          throw new Error('Database error during webhook processing'); 
        }
      }
    }
    return { received: true };
  }

  private hashCustomerAccessToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async assertCustomerAccess(id: string, token?: string): Promise<void> {
    if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
      throw new UnauthorizedException('A valid order access token is required.');
    }

    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { customerAccessTokenHash: true },
    });
    if (!order?.customerAccessTokenHash) throw new NotFoundException('Order not found');

    const providedHash = Buffer.from(this.hashCustomerAccessToken(token), 'hex');
    const storedHash = Buffer.from(order.customerAccessTokenHash, 'hex');
    if (
      providedHash.length !== storedHash.length ||
      !timingSafeEqual(providedHash, storedHash)
    ) {
      throw new UnauthorizedException('A valid order access token is required.');
    }
  }
}
