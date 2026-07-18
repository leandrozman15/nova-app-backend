import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import { CreateShopOrderDto } from './dto/create-shop-order.dto';
import { CreateShopProductDto } from './dto/create-shop-product.dto';
import { UpdateShopOrderDto } from './dto/update-shop-order.dto';
import { UpdateShopProductDto } from './dto/update-shop-product.dto';
import { ShopService } from './shop.service';

@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get('products')
  listProducts(@Req() req: unknown, @Query('clubId') clubId?: string) {
    return this.shopService.listProducts(requireCompanyId(req), { clubId });
  }

  @Roles('admin', 'manager')
  @Post('products')
  createProduct(@Req() req: unknown, @Body() dto: CreateShopProductDto) {
    return this.shopService.createProduct(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager')
  @Patch('products/:id')
  updateProduct(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateShopProductDto) {
    return this.shopService.updateProduct(requireCompanyId(req), id, dto);
  }

  @Roles('admin', 'manager')
  @Delete('products/:id')
  removeProduct(@Req() req: unknown, @Param('id') id: string) {
    return this.shopService.removeProduct(requireCompanyId(req), id);
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Get('orders')
  listOrders(
    @Req() req: unknown,
    @Query('clubId') clubId?: string,
    @Query('customerExternalId') customerExternalId?: string,
  ) {
    return this.shopService.listOrders(requireCompanyId(req), { clubId, customerExternalId });
  }

  @Roles('admin', 'manager', 'coach', 'player', 'member')
  @Post('orders')
  createOrder(@Req() req: unknown, @Body() dto: CreateShopOrderDto) {
    return this.shopService.createOrder(requireCompanyId(req), dto);
  }

  @Roles('admin', 'manager')
  @Patch('orders/:id')
  updateOrder(@Req() req: unknown, @Param('id') id: string, @Body() dto: UpdateShopOrderDto) {
    return this.shopService.updateOrder(requireCompanyId(req), id, dto);
  }
}