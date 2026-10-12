import { isPublicMediaUrl } from './public-media-url';

describe('isPublicMediaUrl', () => {
  afterEach(() => delete process.env.PUBLIC_MEDIA_HOSTS);

  it('accepts Firebase Storage https URLs', () => {
    expect(
      isPublicMediaUrl(
        'https://firebasestorage.googleapis.com/v0/b/app/o/clubs%2Fa.webp?alt=media',
      ),
    ).toBe(true);
    expect(
      isPublicMediaUrl('https://my-app.firebasestorage.app/o/a.webp'),
    ).toBe(true);
  });

  it('rejects other hosts, http and tricky URLs', () => {
    expect(isPublicMediaUrl('https://tracker.example.com/pixel.gif')).toBe(
      false,
    );
    expect(
      isPublicMediaUrl('http://firebasestorage.googleapis.com/a.webp'),
    ).toBe(false);
    expect(isPublicMediaUrl('javascript:alert(1)')).toBe(false);
    expect(
      isPublicMediaUrl(
        'https://firebasestorage.googleapis.com.evil.com/a.webp',
      ),
    ).toBe(false);
    expect(
      isPublicMediaUrl(
        'https://user:pass@firebasestorage.googleapis.com/a.webp',
      ),
    ).toBe(false);
    expect(isPublicMediaUrl(42)).toBe(false);
  });

  it('allows extra hosts from configuration', () => {
    process.env.PUBLIC_MEDIA_HOSTS = 'cdn.fluxi-on.com';
    expect(isPublicMediaUrl('https://cdn.fluxi-on.com/a.webp')).toBe(true);
  });
});

describe('UpdateFacilityPhotosDto validation', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { plainToInstance } = require('class-transformer');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { validateSync } = require('class-validator');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    UpdateFacilityPhotosDto,
  } = require('../../facilities/dto/update-facility-photos.dto');
  const ok = 'https://firebasestorage.googleapis.com/a.webp';
  const errorsFor = (body: unknown) =>
    validateSync(plainToInstance(UpdateFacilityPhotosDto, body));

  it('accepts a valid gallery', () => {
    expect(errorsFor({ photos: [ok], coverUrl: ok })).toHaveLength(0);
  });

  it('rejects foreign hosts inside the list and more than 12 photos', () => {
    expect(
      errorsFor({ photos: [ok, 'https://evil.com/x.png'] }).length,
    ).toBeGreaterThan(0);
    expect(
      errorsFor({ photos: Array.from({ length: 13 }, (_, i) => `${ok}?${i}`) })
        .length,
    ).toBeGreaterThan(0);
  });
});
