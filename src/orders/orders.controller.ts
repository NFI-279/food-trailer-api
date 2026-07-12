// src/orders/orders.controller.ts
import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  @Get('active')
  findActive() {
    return this.ordersService.findActive();
  }

  @Patch(':id/complete')
  completeOrder(@Param('id') id: string) {
    return this.ordersService.completeOrder(id);
  }

  @Get('completed')
  findCompleted() {
    return this.ordersService.findCompleted();
  }

  @Patch(':id/revert')
  revertOrder(@Param('id') id: string) {
    return this.ordersService.revertOrder(id);
  }
}