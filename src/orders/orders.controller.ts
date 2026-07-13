// [Backend] src/orders/orders.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Req, Headers } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Public } from '../auth/public.decorator';


@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Public() // <-- 2. Let customers create orders!
  @Post()
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  // STILL LOCKED (Only Admins can see the active list)
  @Get('active')
  findActive() {
    return this.ordersService.findActive();
  }

  // --- NEW ROUTES ---
  @Patch(':id/start')
  startOrder(@Param('id') id: string) {
    return this.ordersService.startOrder(id);
  }

  @Public() // Public so the customer app can call it!
  @Patch(':id/cancel')
  cancelOrder(@Param('id') id: string) {
    return this.ordersService.cancelOrder(id);
  }

  // STILL LOCKED (Only Admins can mark as completed)
  @Patch(':id/complete')
  completeOrder(@Param('id') id: string) {
    return this.ordersService.completeOrder(id);
  }

  // STILL LOCKED
  @Get('completed')
  findCompleted() {
    return this.ordersService.findCompleted();
  }

  // STILL LOCKED
  @Patch(':id/revert')
  revertOrder(@Param('id') id: string) {
    return this.ordersService.revertOrder(id);
  }

  @Get('unpaid')
  findUnpaid() {
    return this.ordersService.findUnpaid();
  }

  @Patch(':id/pay')
  markPaid(@Param('id') id: string) {
    return this.ordersService.markPaid(id);
  }

  @Public() // <-- Let customers check their own order!
  @Get('status/:orderNumber')
  getStatus(@Param('orderNumber') orderNumber: string) {
    return this.ordersService.getStatusByOrderNumber(orderNumber);
  }

  @Public()
  @Post(':id/checkout')
  createCheckoutSession(
    @Param('id') id: string,
    @Body('customerAppUrl') customerAppUrl: string,
  ) {
    return this.ordersService.createStripeCheckout(id, customerAppUrl);
  }

  @Public()
  @Post('webhook')
  async stripeWebhook(@Headers('stripe-signature') signature: string, @Req() req: any) {
    // We must pass the raw unparsed body to Stripe for security validation
    return this.ordersService.handleStripeWebhook(signature, req.rawBody);
  }
}
