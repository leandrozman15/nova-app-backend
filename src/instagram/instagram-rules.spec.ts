import { buildCaption, CAPTION_MAX, validateMediaUrl } from './instagram-rules';

describe('instagram-rules', () => {
  it('arma el texto con título y cuerpo, y lo recorta a 2200', () => {
    expect(buildCaption(' Hola ', ' Mundo ')).toBe('Hola\n\nMundo');
    expect(buildCaption('', 'solo cuerpo')).toBe('solo cuerpo');
    const long = buildCaption('t', 'x'.repeat(5000));
    expect(long.length).toBe(CAPTION_MAX);
    expect(long.endsWith('…')).toBe(true);
  });

  it('solo acepta archivos del almacenamiento de la app', () => {
    expect(() =>
      validateMediaUrl(
        'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media',
      ),
    ).not.toThrow();
    expect(() => validateMediaUrl('https://evil.example.com/a.jpg')).toThrow();
    expect(() =>
      validateMediaUrl('http://firebasestorage.googleapis.com/a.jpg'),
    ).toThrow();
  });
});
