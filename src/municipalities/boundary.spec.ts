import { parseBoundary } from './boundary';

describe('parseBoundary', () => {
  const tri = [[-34.6, -58.7], [-34.7, -58.7], [-34.7, -58.6]];
  it('acepta un contorno válido', () => expect(parseBoundary(tri)).toEqual(tri));
  it('rechaza menos de 3 puntos', () => expect(parseBoundary(tri.slice(0, 2))).toBeNull());
  it('rechaza coordenadas fuera de rango o no numéricas', () => {
    expect(parseBoundary([...tri, [91, 0]])).toBeNull();
    expect(parseBoundary([...tri, ['a', 1]])).toBeNull();
    expect(parseBoundary([...tri, [1]])).toBeNull();
  });
  it('rechaza más de 500 puntos', () => expect(parseBoundary(Array.from({ length: 501 }, () => [1, 1]))).toBeNull());
});
