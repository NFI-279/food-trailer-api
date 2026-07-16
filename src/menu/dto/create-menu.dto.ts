// [Backend] src/menu/dto/create-menu.dto.ts
import { IsString, IsNumber, Min, IsOptional, IsBoolean } from 'class-validator';

export class CreateMenuDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsString()
  category!: string;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @IsString()
  @IsOptional()
  imageUrl?: string | null;

  @IsString()
  @IsOptional()
  inventoryItemId?: string | null;

  @IsNumber()
  @IsOptional()
  inventoryDeduction?: number | null;
}
