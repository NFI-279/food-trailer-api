// [Backend] src/menu/menu.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MenuService } from './menu.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { Public } from '../auth/public.decorator'; // <-- 1. Import the VIP Pass!
import { Roles } from '../auth/roles.decorator';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Roles('ADMIN')
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

  @Roles('ADMIN')
  @Patch(':id/toggle')
  toggleAvailability(@Param('id') id: string) {
    return this.menuService.toggleAvailability(id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateData: Partial<CreateMenuDto>) {
    return this.menuService.update(id, updateData);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.menuService.remove(id);
  }
}
