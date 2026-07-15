// [Backend] src/orders/dto/create-order.dto.ts
import { IsString, IsNumber, Min, Max, ValidateNested, IsIn, IsArray, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(1)
  @Max(50) // SECURITY: No one can order more than 50 of a single item!
  quantity!: number;
}

export class CreateOrderDto {
  @IsNumber()
  @Min(0)
  totalAmount!: number;

  @IsArray()
  @ArrayMaxSize(20) // SECURITY: No one can have more than 20 different items in one cart!
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsString()
  @IsIn(['CASH', 'CARD'])
  paymentMethod!: string;
}