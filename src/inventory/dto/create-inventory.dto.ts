// [Backend] src/inventory/dto/create-inventory.dto.ts
import { IsString, IsNumber, Min, IsOptional } from 'class-validator';

// 1. Used when ADDING a new ingredient (All fields required)
export class CreateInventoryDto {
  @IsString()
  name!: string;

  @IsString()
  unit!: string;

  @IsNumber()
  @Min(0)
  currentStock!: number;

  @IsNumber()
  @Min(0)
  lowStockThreshold!: number;
}

// 2. Used when EDITING an ingredient (Fields are optional)
export class UpdateInventoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  currentStock?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  lowStockThreshold?: number;
}
