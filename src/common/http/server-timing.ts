import type { NextFunction, Request, Response } from 'express';

/**
 * Agrega `Server-Timing: app;dur=…` a cada respuesta: cuánto tardó el servidor en armarla.
 * Desde el navegador se separa así el tiempo de red del tiempo propio (base de datos, lógica).
 */
export function serverTiming(_req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const writeHead = res.writeHead;
  res.writeHead = function (this: Response, ...args: Parameters<Response['writeHead']>) {
    if (!res.headersSent) {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      res.setHeader('Server-Timing', `app;dur=${ms.toFixed(1)}`);
      res.setHeader('Timing-Allow-Origin', '*');
    }
    return writeHead.apply(this, args);
  } as Response['writeHead'];
  next();
}
