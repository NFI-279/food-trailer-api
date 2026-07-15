// src/inventory/inventory.service.ts
import { Injectable, NotFoundException, , BadRequestException  } from '@nestjs/common';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // 1. Create new ingredient
  async create(createInventoryDto: CreateInventoryDto) {
    return this.prisma.inventoryItem.create({
      data: createInventoryDto,
    });
  }

  // 2. Get all ingredients
  async findAll() {
    return this.prisma.inventoryItem.findMany({
      orderBy: { name: 'asc' }, // Alphabetical order is best for inventory
    });
  }

  // 3. Update an ingredient (used for both quick +/- stock changes AND the edit form)
  async update(id: string, updateData: Partial<CreateInventoryDto>) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Inventory item with ID ${id} not found`);
    }

    return this.prisma.inventoryItem.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    return this.prisma.inventoryItem.delete({ where: { id } });
  }

  async adjustStock(id: string, delta: number) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');

    // Prevent stock from going negative during manual adjustments!
    if (item.currentStock + delta < 0) {
      throw new BadRequestException('Cannot reduce stock below zero.');
    }

    return this.prisma.inventoryItem.update({
      where: { id },
      data: {
        currentStock: { increment: delta } // Atomic database transaction!
      },
    });
  }
}
