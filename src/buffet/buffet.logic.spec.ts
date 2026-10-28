import { expectedCash, saleTotal, toPublicMenu, treasuryAmountForClose, treasuryCategory } from './buffet.logic';

describe('buffet logic', () => {
  it('suma el total de la venta con redondeo a centavos', () => {
    expect(saleTotal([{ quantity: 3, unitPrice: 1.1 }, { quantity: 2, unitPrice: 450 }])).toBe(903.3);
  });

  it('efectivo esperado = fondo + ventas en efectivo', () => {
    expect(expectedCash(5000, 12350.5)).toBe(17350.5);
  });

  it('buffet propio informa todo lo vendido a tesorería', () => {
    expect(treasuryAmountForClose('own', 100000)).toBe(100000);
  });

  it('tercerizado por porcentaje informa solo la participación del club', () => {
    expect(treasuryAmountForClose('percent', 100000, 12.5)).toBe(12500);
  });

  it('canon y sin reporte no generan ingreso en el cierre', () => {
    expect(treasuryAmountForClose('canon', 100000)).toBe(0);
    expect(treasuryAmountForClose('none', 100000)).toBe(0);
  });

  it('categoría de tesorería según el modo', () => {
    expect(treasuryCategory('own')).toBe('Buffet - ventas');
    expect(treasuryCategory('percent')).toContain('participación');
  });
});

describe('toPublicMenu', () => {
  const base = { category: 'Bebidas', imageUrl: null, trackStock: true, active: true };
  it('oculta inactivos, no expone costo/stock y marca disponibilidad', () => {
    const menu = toPublicMenu([
      { ...base, id: '1', name: 'Coca', price: '2500.00', stock: 0 },
      { ...base, id: '2', name: 'Agua', price: 1500, stock: 10 },
      { ...base, id: '3', name: 'Viejo', price: 1, stock: 5, active: false },
      { ...base, id: '4', name: 'Pancho', category: 'Comidas', price: 3000, stock: 0, trackStock: false },
    ]);
    expect(menu.map((m) => m.name)).toEqual(['Agua', 'Coca', 'Pancho']);
    expect(menu.find((m) => m.name === 'Coca')).toEqual({ id: '1', name: 'Coca', category: 'Bebidas', price: 2500, imageUrl: null, available: false });
    expect(menu.find((m) => m.name === 'Pancho')?.available).toBe(true);
    expect(Object.keys(menu[0])).not.toContain('stock');
    expect(Object.keys(menu[0])).not.toContain('cost');
  });
});
