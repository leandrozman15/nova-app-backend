/**
 * Memoria corta en el proceso: pedidos iguales en una ventana de pocos segundos comparten el
 * resultado (y la consulta en curso). Para pantallas que varias personas consultan a la vez
 * —el Live de un club, el fixture— o que una misma pantalla pide desde varias tarjetas.
 */
export class ShortMemo {
  private readonly entries = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(
    private readonly ttlMs: number,
    private readonly max = 2000,
  ) {}

  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as Promise<T>;
    const value = load();
    this.entries.set(key, { at: Date.now(), value });
    if (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    // Un error no queda guardado: el próximo pedido vuelve a intentar.
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    return value;
  }

  clear() {
    this.entries.clear();
  }
}
