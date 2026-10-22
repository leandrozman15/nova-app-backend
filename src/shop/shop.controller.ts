import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { parseBooleanFlag, parsePagination } from '../common/http/pagination';
import { COMPANY_WIDE_ROLES, requireCompanyId } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
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
  listProducts(
    @Req() req: unknown,
    @Query('clubId') clubId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('withMeta') withMeta?: string,
  ) {
    return this.shopService.listProducts(requireCompanyId(req), {
      clubId,
      ...parsePagination(limit, offset),
      withMeta: parseBooleanFlag(withMeta),
    });
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
  async listOrders(
    @Req() req: unknown,
    @Query('clubId') clubId?: string,
    @Query('customerExternalId') customerExternalId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('withMeta') withMeta?: string,
  ) {
    const companyId = requireCompanyId(req);
    const auth = (req as RequestWithAuth).auth;
    const role = auth?.role?.trim().toLowerCase() ?? '';
    const companyWide = COMPANY_WIDE_ROLES.has(role);
    const clubManager = role === 'club_admin' || role === 'manager';

    let scopedClubId = clubId;
    let scopedCustomer = customerExternalId;

    if (!companyWide) {
      // Todo rol de club queda limitado a su club activo.
      if (!auth?.clubId || (clubId && clubId !== auth.clubId)) {
        throw new ForbiddenException('Club fuera de tu contexto activo');
      }
      scopedClubId = auth.clubId;

      // Jugadores, socios y profes solo ven sus propias órdenes.
      if (!clubManager) {
        const identities = await this.shopService.customerIdentities(companyId, auth.uid);
        if (!customerExternalId || !identities.includes(customerExternalId)) {
          throw new ForbiddenException('Solo podés consultar tus propias órdenes');
        }
        scopedCustomer = customerExternalId;
      }
    }

    return this.shopService.listOrders(companyId, {
      clubId: scopedClubId,
      customerExternalId: scopedCustomer,
      ...parsePagination(limit, offset),
      withMeta: parseBooleanFlag(withMeta),
    });
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