// src/orders/dto/create-order.dto.ts
export class CreateOrderItemDto {
  name!: string;
  quantity!: number;
  notes?: string;
}

export class CreateOrderDto {
  orderNumber!: string;
  totalAmount!: number;
  items!: CreateOrderItemDto[]; // Array of items
  paymentMethod!: string; // <-- ADD THIS: "CASH" or "CARD"
}
