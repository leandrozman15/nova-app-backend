import { MediaStorageService, isDataImage } from './media-storage.service';

describe('MediaStorageService', () => {
  afterEach(() => jest.restoreAllMocks());
  const service = new MediaStorageService({ get: () => undefined } as any);

  it('replaces nested base64 images and keeps the rest', async () => {
    jest
      .spyOn(service, 'upload')
      .mockImplementation(async () => 'https://storage.test/x.webp');
    const doc = {
      name: 'Ana',
      photoUrl: 'data:image/webp;base64,AAAA',
      link: 'https://ya.subida/foto.png',
      gallery: ['data:image/png;base64,BBBB', 'https://otra'],
      extra: { dniFront: 'data:image/jpeg;base64,CCCC' },
    };
    const stats = { changed: 0 };
    await service.externalizeDeep(doc, 'clubs/c1/players/p1', stats);
    expect(stats.changed).toBe(3);
    expect(doc).toEqual({
      name: 'Ana',
      photoUrl: 'https://storage.test/x.webp',
      link: 'https://ya.subida/foto.png',
      gallery: ['https://storage.test/x.webp', 'https://otra'],
      extra: { dniFront: 'https://storage.test/x.webp' },
    });
    expect(service.hasDataImage(doc)).toBe(false);
  });

  it('keeps the base64 when the upload fails', async () => {
    jest.spyOn(service, 'upload').mockRejectedValue(new Error('sin permiso'));
    const doc = { photoUrl: 'data:image/png;base64,AAAA' };
    await service.externalizeDeep(doc, 'clubs/c1');
    expect(isDataImage(doc.photoUrl)).toBe(true);
  });

  it('rejects anything that is not an image', async () => {
    await expect(
      service.upload('data:text/html;base64,AAAA', 'x'),
    ).rejects.toThrow('imagen');
  });
});
