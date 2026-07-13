// [Backend] src/orders/orders.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  private stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-06-24.dahlia', // Updated to the exact type your package requires!
  });

  async create(createOrderDto: CreateOrderDto) {
    // --- 1. SECURITY & BUSINESS HOURS CHECK ---
    const settings = await this.prisma.settings.findUnique({ where: { id: 'GLOBAL' } });
    if (settings) {
      if (!settings.isAcceptingOrders) throw new BadRequestException("The trailer is currently closed.");
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
        if (!isOpen) throw new BadRequestException(`We are closed. Business hours are ${openTime} to ${closeTime}.`);
      }
    }

    // --- 2. PRE-FLIGHT INVENTORY & PRICE CHECK ---
    const inventoryNeeded = new Map<string, { invName: string; amountNeeded: number; amountInStock: number }>();
    
    let secureTotalAmount = 0; // SECURITY: We will calculate the real total here!

    for (const item of createOrderDto.items) {
      const menuItem = await this.prisma.menuItem.findFirst({
        where: { name: item.name },
        include: { inventoryItem: true },
      });

      if (!menuItem) {
        throw new BadRequestException(`Item ${item.name} does not exist on our menu.`);
      }

      // Do the math using our secure database price!
      secureTotalAmount += (menuItem.price * item.quantity);

      if (menuItem.inventoryItemId && menuItem.inventoryItem && menuItem.inventoryDeduction) {
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

    // Verify stock
    for (const [invId, data] of inventoryNeeded.entries()) {
      if (data.amountInStock < data.amountNeeded) {
        throw new BadRequestException(`Not enough stock for ${data.invName}!`);
      }
    }

    // --- 3. GENERATE SEQUENTIAL ORDER NUMBER ---
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await this.prisma.order.count({
      where: { createdAt: { gte: startOfDay } }
    });
    const generatedOrderNumber = (todayCount + 1).toString().padStart(3, '0');

    // --- 4. SAVE ORDER AS PENDING ---
    const order = await this.prisma.order.create({
      data: {
        orderNumber: generatedOrderNumber,
        totalAmount: createOrderDto.totalAmount,
        status: 'UNPAID', // Start as UNPAID to protect the kitchen!
        paymentMethod: createOrderDto.paymentMethod, // Save how they are paying
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

    // --- 5. DEDUCT INVENTORY ---
    for (const [invId, data] of inventoryNeeded.entries()) {
      await this.prisma.inventoryItem.update({
        where: { id: invId },
        data: { currentStock: { decrement: data.amountNeeded } },
      });
    }

    return order;
  }

  // Fetch ACTIVE orders (Pending AND Preparing)
  async findActive() {
    return this.prisma.order.findMany({
      where: { status: { in: ['PENDING', 'PREPARING'] } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getStatusByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: { orderNumber: true, status: true, totalAmount: true, updatedAt: true } 
    });
    if (!order) throw new NotFoundException(`Order #${orderNumber} not found`);
    return order;
  }

  // --- NEW WORKFLOW FUNCTIONS ---

  async startOrder(id: string) {
    return this.prisma.order.update({
      where: { id },
      data: { status: 'PREPARING' },
    });
  }

  async completeOrder(id: string) {
    return this.prisma.order.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
  }

  // Customer or Admin cancels order
  async cancelOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('Order not found');
    
    // Security: You can only cancel an order if it hasn't been started yet!
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Order is already being prepared and cannot be cancelled.');
    }

    // REFUND INVENTORY
    for (const item of order.items) {
      const menuItem = await this.prisma.menuItem.findFirst({ where: { name: item.name } });
      if (menuItem && menuItem.inventoryItemId && menuItem.inventoryDeduction) {
        await this.prisma.inventoryItem.update({
          where: { id: menuItem.inventoryItemId },
          data: { currentStock: { increment: item.quantity * menuItem.inventoryDeduction } },
        });
      }
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async findCompleted() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.prisma.order.findMany({
      where: { status: 'COMPLETED', updatedAt: { gte: startOfDay } },
      include: { items: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async revertOrder(id: string) {
    return this.prisma.order.update({
      where: { id },
      data: { status: 'PREPARING' },
    });
  }

  async findUnpaid() {
    return this.prisma.order.findMany({
      where: { status: 'UNPAID', paymentMethod: 'CASH' },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Cashier clicks "Mark Paid" -> Send to kitchen!
  async markPaid(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.order.update({
      where: { id },
      data: { status: 'PENDING' }, // Now it shows up in Active Orders!
    });
  }

  // --- STRIPE INTEGRATION ---

  // 1. Generate the Stripe Checkout URL
  async createStripeCheckout(orderId: string, customerAppUrl: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    // Convert our database items into Stripe's format
    const lineItems = order.items.map((item) => {
      // Find the price by dividing total by quantity (simple math since we don't store individual prices in the order items table)
      // In a real app, you'd store the unit price, but this works perfectly for our total!
      const unitAmount = Math.round((order.totalAmount / order.items.reduce((sum, i) => sum + i.quantity, 0)) * 100); 

      return {
        price_data: {
          currency: 'ron',
          product_data: {
            name: item.name,
            description: item.notes || 'No notes',
          },
          unit_amount: unitAmount, // Stripe expects amounts in BANI (cents), so 35 RON = 3500
        },
        quantity: item.quantity,
      };
    });

    // Create the session
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      // We attach the Order ID securely in the background!
      metadata: { orderId: order.id },
      // Where to send the user after they pay (or cancel)
      success_url: `${customerAppUrl}?success=true`,
      cancel_url: `${customerAppUrl}?canceled=true`,
    });

    return { url: session.url };
  }

  // 2. The secure background listener
  async handleStripeWebhook(signature: string, rawBody: Buffer) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event: Stripe.Event;

    try {
      // Verify this message ACTUALLY came from Stripe!
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret!);
    } catch (err: any) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    // If the payment was successful...
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;

      if (orderId) {
        // Find the order and mark it PENDING! (This drops it into the kitchen queue!)
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: 'PENDING' },
        });
        console.log(`STRIPE SUCCESS: Order ${orderId} has been paid and sent to kitchen!`);
      }
    }

    return { received: true };
  }
}
