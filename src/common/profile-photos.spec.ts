import { photosByUid, studentPhotos } from './profile-photos';

function db(over: Record<string, unknown> = {}) {
  return {
    storeDocument: { findMany: jest.fn().mockResolvedValue([]) },
    player: { findMany: jest.fn().mockResolvedValue([]) },
    coachProfile: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    ...over,
  } as never;
}

describe('profile photos', () => {
  it('usa la foto del legajo de staff antes que la del padrón', async () => {
    const photos = await photosByUid(
      db({
        storeDocument: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ docId: 'u1', data: { photoUrl: 'staff.jpg' } }]),
        },
        player: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'p1', authUid: 'u1', legacyId: null, photoUrl: 'yo.jpg' },
            { id: 'p2', authUid: 'u2', legacyId: null, photoUrl: 'u2.jpg' },
          ]),
        },
      }),
      ['u1', 'u2'],
    );
    expect(photos.get('u1')).toBe('staff.jpg');
    expect(photos.get('u2')).toBe('u2.jpg');
  });

  it('el alumno toma la foto de su ficha o de su cuenta', async () => {
    const photos = await studentPhotos(
      db({
        player: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([{ id: 'pl1', photoUrl: 'ficha.jpg' }])
            .mockResolvedValue([]),
        },
        user: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'us2', firebaseUid: 'fb2' }]),
        },
        coachProfile: {
          findMany: jest.fn().mockResolvedValue([
            { photoUrl: 'cuenta.jpg', user: { firebaseUid: 'fb2' } },
          ]),
        },
      }),
      [
        { id: 's1', playerId: 'pl1', userId: null },
        { id: 's2', playerId: null, userId: 'us2' },
        { id: 's3', playerId: null, userId: null },
      ],
    );
    expect(photos.get('s1')).toBe('ficha.jpg');
    expect(photos.get('s2')).toBe('cuenta.jpg');
    expect(photos.has('s3')).toBe(false);
  });

  it('si la base falla, sigue sin fotos', async () => {
    const photos = await photosByUid(
      db({ storeDocument: { findMany: jest.fn().mockRejectedValue(new Error('x')) } }),
      ['u1'],
    );
    expect(photos.size).toBe(0);
  });
});
