// [Backend] src/menu/menu.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MenuService } from './menu.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { Public } from '../auth/public.decorator'; // <-- 1. Import the VIP Pass!

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  // STILL LOCKED (Only Admins can create)
  @Post()
  create(@Body() createMenuDto: CreateMenuDto) {
    return this.menuService.create(createMenuDto);
  }

  // UNLOCKED! (Customers can read the menu)
  @Public() // <-- 2. Add the VIP Pass here!
  @Get()
  findAll() {
    return this.menuService.findAll();
  }

  // STILL LOCKED (Only Admins can toggle)
  @Patch(':id/toggle')
  toggleAvailability(@Param('id') id: string) {
    return this.menuService.toggleAvailability(id);
  }

  // STILL LOCKED (Only Admins can update)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateData: Partial<CreateMenuDto>) {
    return this.menuService.update(id, updateData);
  }

  // STILL LOCKED (Only Admins can delete)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.menuService.remove(id);
  }
}
