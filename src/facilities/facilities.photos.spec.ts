import { BadRequestException, NotFoundException } from '@nestjs/common';

import { FacilitiesService } from './facilities.service';

describe('FacilitiesService.updatePhotos', () => {
  const a = 'https://firebasestorage.googleapis.com/a.webp';
  const b = 'https://firebasestorage.googleapis.com/b.webp';
  let prisma: any;
  let service: FacilitiesService;

  beforeEach(() => {
    prisma = {
      facility: {
        findFirst: jest.fn().mockResolvedValue({ id: 'f1', clubId: 'club-a' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new FacilitiesService(prisma);
  });

  it('stores the gallery and uses the first photo as cover by default', async () => {
    await service.updatePhotos('company-a', 'f1', { photos: [a, b, a] });
    expect(prisma.facility.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'f1' },
        data: { photos: [a, b], photoUrl: a },
      }),
    );
  });

  it('uses the chosen cover and clears it when the gallery is empty', async () => {
    await service.updatePhotos('company-a', 'f1', {
      photos: [a, b],
      coverUrl: b,
    });
    expect(prisma.facility.update.mock.calls[0][0].data.photoUrl).toBe(b);
    await service.updatePhotos('company-a', 'f1', { photos: [] });
    expect(prisma.facility.update.mock.calls[1][0].data).toEqual({
      photos: [],
      photoUrl: null,
    });
  });

  it('rejects a cover that is not in the gallery', async () => {
    await expect(
      service.updatePhotos('company-a', 'f1', { photos: [a], coverUrl: b }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.facility.update).not.toHaveBeenCalled();
  });

  it('is scoped to the company', async () => {
    prisma.facility.findFirst.mockResolvedValue(null);
    await expect(
      service.updatePhotos('company-b', 'f1', { photos: [a] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.facility.findFirst).toHaveBeenCalledWith({
      where: { companyId: 'company-b', id: 'f1' },
    });
  });
});
