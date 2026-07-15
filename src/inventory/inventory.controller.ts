// src/inventory/inventory.controller.ts
import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { Delete } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator'; 

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

   @Roles('ADMIN')
  @Post()
  create(@Body() createInventoryDto: CreateInventoryDto) {
    return this.inventoryService.create(createInventoryDto);
  }

  @Get()
  findAll() {
    return this.inventoryService.findAll();
  }

   @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateData: Partial<CreateInventoryDto>) {
    return this.inventoryService.update(id, updateData);
  }

   @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }

  @Roles('ADMIN')
  @Patch(':id/adjust')
  adjustStock(@Param('id') id: string, @Body('delta') delta: number) {
    return this.inventoryService.adjustStock(id, delta);
  }
}
