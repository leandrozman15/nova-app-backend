import { expectedCash, saleTotal, treasuryAmountForClose, treasuryCategory } from './buffet.logic';

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
