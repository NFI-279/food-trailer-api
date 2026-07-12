// src/inventory/dto/create-inventory.dto.ts
export class CreateInventoryDto {
  name!: string;
  unit!: string;
  currentStock!: number;
  lowStockThreshold!: number;
}