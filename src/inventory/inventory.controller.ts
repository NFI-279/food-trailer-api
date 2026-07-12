// src/inventory/inventory.controller.ts
import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { Delete } from '@nestjs/common';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  create(@Body() createInventoryDto: CreateInventoryDto) {
    return this.inventoryService.create(createInventoryDto);
  }

  @Get()
  findAll() {
    return this.inventoryService.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateData: Partial<CreateInventoryDto>) {
    return this.inventoryService.update(id, updateData);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }
}