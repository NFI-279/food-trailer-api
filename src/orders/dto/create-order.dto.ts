// [Backend] src/orders/dto/create-order.dto.ts
import { IsString, IsNumber, IsInt, Min, Max, ValidateNested, IsIn, IsArray, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  @Max(50) // SECURITY: No one can order more than 50 of a single item!
  quantity!: number;
}

export class CreateOrderDto {
  @IsNumber()
  @Min(0)
  totalAmount!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20) // SECURITY: No one can have more than 20 different items in one cart!
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsString()
  @IsIn(['CASH', 'CARD'])
  paymentMethod!: string;
}