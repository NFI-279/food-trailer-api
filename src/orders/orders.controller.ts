// [Backend] src/orders/orders.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Req, Headers } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator'; // <-- IMPORT THIS!

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // --- PUBLIC CUSTOMER ROUTES ---
  @Public()
  @Post()
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  @Public() 
  @Get('status/:id')
  getStatus(@Param('id') id: string, @Headers('x-order-token') token?: string) {
    return this.ordersService.getStatusById(id, token);
  }

  @Public() 
  @Patch(':id/cancel-unpaid')
  cancelUnpaidOrder(@Param('id') id: string, @Headers('x-order-token') token?: string) {
    return this.ordersService.cancelUnpaidOrder(id, token);
  }

  @Public()
  @Post(':id/checkout')
  createCheckoutSession(@Param('id') id: string, @Headers('x-order-token') token?: string) {
    return this.ordersService.createStripeCheckout(id, token);
  }

  @Public()
  @Post('webhook')
  async stripeWebhook(@Headers('stripe-signature') signature: string, @Req() req: any) {
    return this.ordersService.handleStripeWebhook(signature, req.rawBody);
  }

  // --- ADMIN ONLY ROUTES ---
  @Roles('ADMIN')
  @Get('active')
  findActive() {
    return this.ordersService.findActive();
  }

  @Roles('ADMIN')
  @Get('unpaid')
  findUnpaid() {
    return this.ordersService.findUnpaid();
  }

  @Roles('ADMIN')
  @Get('completed')
  findCompleted() {
    return this.ordersService.findCompleted();
  }

  @Roles('ADMIN')
  @Patch(':id/pay')
  markPaid(@Param('id') id: string) {
    return this.ordersService.markPaid(id);
  }

  @Roles('ADMIN')
  @Patch(':id/start')
  startOrder(@Param('id') id: string) {
    return this.ordersService.startOrder(id);
  }

  @Roles('ADMIN')
  @Patch(':id/complete')
  completeOrder(@Param('id') id: string) {
    return this.ordersService.completeOrder(id);
  }

  @Roles('ADMIN')
  @Patch(':id/revert')
  revertOrder(@Param('id') id: string) {
    return this.ordersService.revertOrder(id);
  }

  @Roles('ADMIN')
  @Patch(':id/cancel')
  cancelOrder(@Param('id') id: string) {
    return this.ordersService.cancelOrder(id);
  }
}