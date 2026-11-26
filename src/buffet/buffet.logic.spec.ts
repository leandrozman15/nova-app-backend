import {
  bookingMethodOf,
  courtBalance,
  expectedCash,
  mergePayments,
  saleMethodOf,
  saleTotal,
  sumPayments,
  takeFromPool,
  toPublicMenu,
  treasuryAmountForClose,
  treasuryCategory,
} from './buffet.logic';

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

  describe('pagos divididos y cuenta de alquiler', () => {
    it('une los cobros del mismo medio y descarta los vacíos', () => {
      expect(mergePayments([
        { method: 'cash', amount: 1000 },
        { method: 'transfer', amount: 0 },
        { method: 'cash', amount: 500.5 },
        { method: 'card', amount: 200 },
      ])).toEqual([{ method: 'cash', amount: 1500.5 }, { method: 'card', amount: 200 }]);
    });

    it('la venta guarda el medio único o "mixed" si se pagó con varios', () => {
      expect(saleMethodOf([{ method: 'cash', amount: 10 }])).toBe('cash');
      expect(saleMethodOf([{ method: 'cash', amount: 10 }, { method: 'transfer', amount: 5 }])).toBe('mixed');
      expect(sumPayments([{ method: 'cash', amount: 0.1 }, { method: 'card', amount: 0.2 }])).toBe(0.3);
    });

    it('reparte lo pagado entre consumos y cancha sin perder ni inventar plata', () => {
      // La cuenta: consumos 3000 + cancha 7000. El cliente paga 6000 en efectivo y 4000 por transferencia.
      const pool = mergePayments([{ method: 'cash', amount: 6000 }, { method: 'transfer', amount: 4000 }]);
      const buffet = takeFromPool(pool, 3000);
      const court = takeFromPool(pool, 7000);
      expect(buffet).toEqual([{ method: 'cash', amount: 3000 }]);
      expect(court).toEqual([{ method: 'cash', amount: 3000 }, { method: 'transfer', amount: 4000 }]);
      expect(sumPayments(buffet) + sumPayments(court)).toBe(10000);
      expect(pool.every((p) => p.amount === 0)).toBe(true);
    });

    it('un consumo puede quedar cubierto por dos medios', () => {
      const pool = mergePayments([{ method: 'cash', amount: 1000 }, { method: 'card', amount: 4000 }]);
      expect(takeFromPool(pool, 2500)).toEqual([{ method: 'cash', amount: 1000 }, { method: 'card', amount: 1500 }]);
      expect(pool).toEqual([{ method: 'cash', amount: 0 }, { method: 'card', amount: 2500 }]);
    });

    it('lo que falta de la cancha es precio menos lo cobrado y nunca negativo', () => {
      expect(courtBalance(12000, 3000)).toBe(9000);
      expect(courtBalance(12000, 12000)).toBe(0);
      expect(courtBalance(12000, 15000)).toBe(0);
    });

    it('el turno registra el medio principal, y tarjeta o Mercado Pago cuentan como "otro"', () => {
      expect(bookingMethodOf([{ method: 'cash', amount: 100 }, { method: 'transfer', amount: 900 }])).toBe('transfer');
      expect(bookingMethodOf([{ method: 'card', amount: 100 }])).toBe('other');
      expect(bookingMethodOf([{ method: 'cash', amount: 100 }])).toBe('cash');
    });
  });
});
