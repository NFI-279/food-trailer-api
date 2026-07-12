export class CreateMenuDto {
  name!: string;
  description?: string;
  price!: number;
  category!: string;
  isAvailable?: boolean;
  imageUrl?: string;
  inventoryItemId?: string;      // NEW
  inventoryDeduction?: number;   // NEW
}