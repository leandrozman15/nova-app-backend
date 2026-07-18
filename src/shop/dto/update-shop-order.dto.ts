import { IsIn } from 'class-validator';

export class UpdateShopOrderDto {
  @IsIn(['pending', 'preparing', 'ready', 'delivered', 'cancelled'])
  status!: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
}