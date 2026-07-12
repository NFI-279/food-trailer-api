// src/menu/menu.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateMenuDto } from './dto/create-menu.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuService {
  constructor(private prisma: PrismaService) {}

  // 1. Create a new menu item
  async create(createMenuDto: CreateMenuDto) {
    return this.prisma.menuItem.create({
      data: {
        name: createMenuDto.name,
        description: createMenuDto.description,
        price: createMenuDto.price,
        category: createMenuDto.category,
        isAvailable: createMenuDto.isAvailable ?? true,
        imageUrl: createMenuDto.imageUrl,
        inventoryItemId: createMenuDto.inventoryItemId,       // <-- ADD THIS
        inventoryDeduction: createMenuDto.inventoryDeduction,
      },
    });
  }

  // 2. Get all menu items
  async findAll() {
    return this.prisma.menuItem.findMany({
      orderBy: { createdAt: 'desc' }, // Show newest items first
    });
  }

  // 3. Toggle availability (Quick switch on the frontend table)
  async toggleAvailability(id: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    return this.prisma.menuItem.update({
      where: { id },
      data: { isAvailable: !item.isAvailable },
    });
  }
  
  // 4. Delete a menu item
  async remove(id: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    return this.prisma.menuItem.delete({
      where: { id },
    });
  }

  // 5. Update a menu item
  async update(id: string, updateData: Partial<CreateMenuDto>) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    return this.prisma.menuItem.update({
      where: { id },
      data: updateData,
    });
  }
}