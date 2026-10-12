import { ConflictException } from '@nestjs/common';

import { FacilitiesService } from './facilities.service';

describe('FacilitiesService rentals vs online bookings', () => {
  let prisma: any;
  let service: FacilitiesService;
  const dto = {
    clubId: 'club-a',
    facilityId: 'f1',
    clientName: 'Mostrador',
    day: 'Lun',
    hour: 18,
    price: 1000,
  };

  beforeEach(() => {
    prisma = {
      club: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ timezone: 'America/Argentina/Buenos_Aires' }),
      },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
      facilityRental: {
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
        update: jest.fn().mockResolvedValue({ id: 'r1' }),
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'r1',
            clubId: 'club-a',
            facilityId: 'f1',
            day: 'Mar',
            hour: 20,
          }),
      },
    };
    service = new FacilitiesService(prisma);
  });

  it('creates the rental when no active online booking uses that weekday and hour', async () => {
    // 2026-10-13 es martes: no choca con un alquiler de los lunes.
    prisma.booking.findMany.mockResolvedValue([{ date: '2026-10-13' }]);
    await service.createRental('company-a', dto);
    expect(prisma.facilityRental.create).toHaveBeenCalled();
    expect(prisma.booking.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        clubId: 'club-a',
        facilityId: 'f1',
        hour: 18,
        status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] },
      }),
    );
  });

  it('rejects a counter rental over an upcoming online booking on the same weekday', async () => {
    // 2026-10-19 es lunes.
    prisma.booking.findMany.mockResolvedValue([{ date: '2026-10-19' }]);
    await expect(service.createRental('company-a', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.facilityRental.create).not.toHaveBeenCalled();
  });

  it('only re-checks on update when the rental moves to another slot', async () => {
    await service.updateRental('company-a', 'r1', {
      clientName: 'Otro nombre',
    });
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
    expect(prisma.facilityRental.update).toHaveBeenCalledTimes(1);

    prisma.booking.findMany.mockResolvedValue([{ date: '2026-10-19' }]);
    await expect(
      service.updateRental('company-a', 'r1', { day: 'Lun', hour: 18 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.facilityRental.update).toHaveBeenCalledTimes(1);
  });
});
