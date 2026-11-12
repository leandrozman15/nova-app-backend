import { buildVoucher } from './sistemas360.client';

const base = { externalRef: 'r1', description: 'Cuota', amount: 15000, customerName: '', email: null, date: '2026-11-01' };

describe('buildVoucher', () => {
  it('Factura C: consumidor final, sin impuestos por ítem', () => {
    const v = buildVoucher({ ...base, voucherType: 'factura_c' }) as any;
    expect(v.tipo_comprobante).toBe('factura_c');
    expect(v.cliente).toMatchObject({ documento_tipo: 'consumidor_final', documento_numero: null, condicion_iva_receptor_id: 5, razon_social: 'Consumidor Final' });
    expect(v.items[0].iva).toBeUndefined();
    expect(v.precios_incluyen_iva).toBeUndefined();
    expect(v.total).toBe(15000);
  });
  it('Factura B: IVA 21% incluido y email del cliente', () => {
    const v = buildVoucher({ ...base, voucherType: 'factura_b', email: 'a@b.com' }) as any;
    expect(v.items[0]).toMatchObject({ tipo_impuesto: 'gravado', iva: 21 });
    expect(v.precios_incluyen_iva).toBe(true);
    expect(v.cliente.email).toBe('a@b.com');
  });
});
