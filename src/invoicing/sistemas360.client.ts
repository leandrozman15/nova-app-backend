import { BadGatewayException, UnauthorizedException } from '@nestjs/common';

const BASE = (process.env.SISTEMAS360_API_URL || 'https://api.sistemas360.ar').replace(/\/$/, '');

type Json = Record<string, any>;

export type InvoiceInput = {
  voucherType: string;
  externalRef: string;
  description: string;
  amount: number;
  customerName: string;
  email?: string | null;
  date: string;
};

async function call(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new BadGatewayException('No se pudo contactar a Sistemas 360.');
  }
  const json = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, json };
}

export const buildVoucher = (i: InvoiceInput): Json => ({
  tipo_comprobante: i.voucherType,
  concepto: 'servicios',
  fecha: i.date,
  referencia_externa: i.externalRef,
  cliente: {
    documento_tipo: 'consumidor_final',
    documento_numero: null,
    razon_social: i.customerName || 'Consumidor Final',
    condicion_iva_receptor_id: 5,
    ...(i.email ? { email: i.email } : {}),
  },
  items: [
    {
      descripcion: i.description,
      cantidad: 1,
      precio_unitario: i.amount,
      // Solo Factura B lleva IVA discriminado (el precio ya lo incluye).
      ...(i.voucherType === 'factura_c' ? {} : { tipo_impuesto: 'gravado', iva: 21 }),
    },
  ],
  ...(i.voucherType === 'factura_c' ? {} : { precios_incluyen_iva: true }),
  total: i.amount,
  moneda: 'PES',
});

export class Sistemas360Client {
  /** Verifica que el token sea válido (401 = inválido). */
  async checkToken(token: string): Promise<void> {
    const r = await call(token, 'GET', '/api/comprobantes?per_page=1');
    if (r.status === 401 || r.status === 403)
      throw new UnauthorizedException('El token de Sistemas 360 no es válido.');
    if (r.status >= 500) throw new BadGatewayException('Sistemas 360 no está disponible.');
  }

  async issue(token: string, input: InvoiceInput) {
    const r = await call(token, 'POST', '/api/comprobantes', buildVoucher(input));
    if (r.status === 401 || r.status === 403)
      throw new UnauthorizedException('El token de Sistemas 360 no es válido.');
    const d = (r.json.data ?? {}) as Json;
    if (r.status >= 400 && !d.estado)
      throw new BadGatewayException(String(r.json.mensaje ?? r.json.message ?? `Sistemas 360 respondió ${r.status}`));
    return {
      externalId: d.id != null ? String(d.id) : null,
      status: String(d.estado ?? 'error'),
      pointOfSale: typeof d.punto_venta === 'number' ? d.punto_venta : null,
      number: typeof d.numero_comprobante === 'number' ? d.numero_comprobante : null,
      cae: (d.cae as string) ?? null,
      caeDueDate: (d.cae_vencimiento as string) ?? null,
      pdfUrl: (d.imprimir_a4_url as string) ?? null,
      qrUrl: (d.qr?.url as string) ?? null,
      message: r.json.mensaje as string | undefined,
    };
  }

  async retry(token: string, externalId: string) {
    const r = await call(token, 'POST', `/api/comprobantes/${encodeURIComponent(externalId)}/reintentar`);
    const d = (r.json.data ?? {}) as Json;
    return {
      status: String(d.estado ?? 'error'),
      pointOfSale: typeof d.punto_venta === 'number' ? d.punto_venta : null,
      number: typeof d.numero_comprobante === 'number' ? d.numero_comprobante : null,
      cae: (d.cae as string) ?? null,
      caeDueDate: (d.cae_vencimiento as string) ?? null,
      pdfUrl: (d.imprimir_a4_url as string) ?? null,
      qrUrl: (d.qr?.url as string) ?? null,
    };
  }
}
