// src/orders/dto/create-order.dto.ts
import { IsString, IsNumber, Min, IsOptional, ValidateNested, IsIn, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(1) // SECURITY: Quantity CANNOT be less than 1!
  quantity!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateOrderDto {
  @IsNumber()
  @Min(0)
  totalAmount!: number; // We still receive it, but we won't trust it!

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsString()
  @IsIn(['CASH', 'CARD']) // SECURITY: Can only be these two words!
  paymentMethod!: string;
}
