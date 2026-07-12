// src/menu/menu.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MenuService } from './menu.service';
import { CreateMenuDto } from './dto/create-menu.dto';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Post()
  create(@Body() createMenuDto: CreateMenuDto) {
    return this.menuService.create(createMenuDto);
  }

  @Get()
  findAll() {
    return this.menuService.findAll();
  }

  @Patch(':id/toggle')
  toggleAvailability(@Param('id') id: string) {
    return this.menuService.toggleAvailability(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.menuService.remove(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateData: Partial<CreateMenuDto>) {
    return this.menuService.update(id, updateData);
  }
}