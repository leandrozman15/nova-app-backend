import { ShortMemo } from './short-memo';

describe('ShortMemo', () => {
  it('pedidos iguales dentro de la ventana comparten una sola carga', async () => {
    const memo = new ShortMemo(1000);
    const load = jest.fn(async () => 42);
    const [a, b] = await Promise.all([memo.get('k', load), memo.get('k', load)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('pasada la ventana vuelve a cargar', async () => {
    const memo = new ShortMemo(0);
    const load = jest.fn(async () => 1);
    await memo.get('k', load);
    await memo.get('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('un error no queda guardado', async () => {
    const memo = new ShortMemo(10_000);
    const load = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(2);
    await expect(memo.get('k', load)).rejects.toThrow('x');
    await expect(memo.get('k', load)).resolves.toBe(2);
  });
});
