// [Backend] src/orders/orders.controller.ts
import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Public } from '../auth/public.decorator'; // <-- 1. Import the VIP Pass!

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

  @Public() // <-- Let customers check their own order!
  @Get('status/:orderNumber')
  getStatus(@Param('orderNumber') orderNumber: string) {
    return this.ordersService.getStatusByOrderNumber(orderNumber);
  }
}
