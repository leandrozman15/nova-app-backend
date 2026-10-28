import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CreateProductDto, UpdateProductDto } from './buffet.dto';

const errors = (cls: any, body: object) => validate(plainToInstance(cls, body));

describe('imageUrl de productos del buffet', () => {
  const base = { name: 'Hamburguesa', price: 5000 };

  it('acepta una foto chica en data URL', async () => {
    expect(await errors(CreateProductDto, { ...base, imageUrl: 'data:image/webp;base64,UklGRiQAAABXRUJQ' })).toHaveLength(0);
  });

  it('acepta una URL https y rechaza http o texto suelto', async () => {
    expect(await errors(CreateProductDto, { ...base, imageUrl: 'https://firebasestorage.googleapis.com/x.webp' })).toHaveLength(0);
    expect(await errors(CreateProductDto, { ...base, imageUrl: 'http://x.com/a.png' })).not.toHaveLength(0);
    expect(await errors(CreateProductDto, { ...base, imageUrl: 'javascript:alert(1)' })).not.toHaveLength(0);
    expect(await errors(CreateProductDto, { ...base, imageUrl: 'data:text/html;base64,AAAA' })).not.toHaveLength(0);
  });

  it('rechaza imágenes demasiado grandes', async () => {
    const big = `data:image/webp;base64,${'A'.repeat(160_000)}`;
    expect(await errors(CreateProductDto, { ...base, imageUrl: big })).not.toHaveLength(0);
  });

  it('en edición permite null para quitar la foto', async () => {
    expect(await errors(UpdateProductDto, { imageUrl: null })).toHaveLength(0);
  });
});
