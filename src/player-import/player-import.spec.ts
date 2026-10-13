jest.mock('../firebase/firebase-admin.service', () => ({
  FirebaseAdminService: class {},
}));

import { PlayerImportService } from './player-import.service';
import { ageOn, parseBirthDate, validateRows } from './player-import.rules';

const context = {
  today: '2026-10-13',
  disciplines: [
    { sportId: 'football', name: 'Fútbol' },
    { sportId: 'hockey', name: 'Hockey' },
  ],
  divisions: [
    { id: 'd1', name: 'Sub 15', sport: 'football' },
    { id: 'd2', name: 'Primera', sport: 'football' },
    { id: 'd3', name: 'Sub 15', sport: 'hockey' },
  ],
};

const base = {
  firstName: 'juan carlos',
  lastName: 'PÉREZ',
  dni: '45.123.456',
  birthDate: '03/05/2011',
  gender: 'm',
  sport: 'futbol',
  category: 'sub 15',
};

describe('reglas de la implantación', () => {
  it('parses the usual birth date formats and Excel serials', () => {
    expect(parseBirthDate('03/05/2011')).toBe('2011-05-03');
    expect(parseBirthDate('3-5-11')).toBe('2011-05-03');
    expect(parseBirthDate('2011-05-03')).toBe('2011-05-03');
    expect(parseBirthDate(40666)).toBe('2011-05-03');
    expect(parseBirthDate('31/02/2011')).toBeNull();
    expect(ageOn('2011-05-03', '2026-10-13')).toBe(15);
    expect(ageOn('2011-10-14', '2026-10-13')).toBe(14);
  });

  it('normalizes a valid row and matches sport and category ignoring accents and case', () => {
    const [result] = validateRows(
      [{ row: 2, ...base, minorAuth: 'si', province: 'Bs. As.' }],
      context,
    );
    expect(result.status).toBe('ok');
    expect(result.player).toMatchObject({
      firstName: 'Juan Carlos',
      lastName: 'Pérez',
      dni: '45123456',
      birthDate: '2011-05-03',
      age: 15,
      gender: 'Masculino',
      sport: 'football',
      divisionId: 'd1',
      divisionName: 'Sub 15',
      branch: 'masculino',
      hasMinorAuth: true,
      province: 'Buenos Aires',
    });
  });

  it('reports what is wrong in each row', () => {
    const results = validateRows(
      [
        { row: 2, ...base },
        {
          row: 3,
          ...base,
          firstName: '',
          birthDate: '2011/99/99',
          gender: 'z',
          sport: 'rugby',
        },
        { row: 4, ...base, dni: '45123456' },
      ],
      context,
    );
    expect(results[1].status).toBe('error');
    expect(results[1].errors.join(' ')).toMatch(/Falta el nombre/);
    expect(results[1].errors.join(' ')).toMatch(/Fecha de nacimiento inválida/);
    expect(results[1].errors.join(' ')).toMatch(/Sexo no reconocido/);
    expect(results[1].errors.join(' ')).toMatch(
      /no tiene la disciplina "rugby".*Fútbol, Hockey/,
    );
    expect(results[2].errors[0]).toMatch(
      /DNI repetido en la planilla \(fila 2\)/,
    );
  });

  it('imports with a warning when the category does not exist or the minor has no authorization', () => {
    const [result] = validateRows(
      [{ row: 2, ...base, category: 'Sub 99', email: 'mal' }],
      context,
    );
    expect(result.status).toBe('warning');
    expect(result.player?.divisionId).toBeNull();
    expect(result.player?.email).toBeNull();
    expect(result.warnings.join(' ')).toMatch(
      /No existe la categoría "Sub 99" en Fútbol: queda sin categoría. Categorías: Sub 15, Primera/,
    );
    expect(result.warnings.join(' ')).toMatch(/menor de edad/);
  });
});

describe('PlayerImportService', () => {
  function setup() {
    const docs = (items: Array<Record<string, unknown> & { id: string }>) => ({
      docs: items.map((item) => ({
        id: item.id,
        get: (key: string) => item[key],
      })),
    });
    const batch = {
      set: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    const playersCollection = {
      doc: jest.fn((id: string) => ({ id })),
      where: jest.fn(() => ({
        get: jest
          .fn()
          .mockResolvedValue(docs([{ id: 'fs1', dni: '30111222' }])),
      })),
    };
    const clubDoc = {
      collection: jest.fn((name: string) =>
        name === 'available_disciplines'
          ? {
              get: jest
                .fn()
                .mockResolvedValue(
                  docs([
                    { id: 'x', sportId: 'football', customName: 'Fútbol' },
                  ]),
                ),
            }
          : name === 'divisions'
            ? {
                get: jest
                  .fn()
                  .mockResolvedValue(
                    docs([{ id: 'd1', name: 'Sub 15', sport: 'football' }]),
                  ),
              }
            : playersCollection,
      ),
    };
    const firebase: any = {
      firestore: {
        collection: jest.fn(() => ({ doc: jest.fn(() => clubDoc) })),
        batch: jest.fn(() => batch),
      },
    };
    const prisma: any = {
      club: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          name: 'Club Norte',
          city: null,
          companyId: 'co1',
          timezone: 'America/Argentina/Buenos_Aires',
        }),
      },
      player: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              dni: '28999888',
              firstName: 'Ana',
              lastName: 'Gómez',
              clubId: 'c1',
            },
          ])
          .mockResolvedValueOnce([{ email: 'tomado@mail.com' }]),
        create: jest.fn().mockImplementation(() => ({
          id: `p${prisma.player.create.mock.calls.length}`,
        })),
      },
    };
    const audit = { record: jest.fn() };
    return {
      prisma,
      firebase,
      batch,
      audit,
      service: new PlayerImportService(prisma, firebase, audit as any),
    };
  }

  const rows = [
    { row: 2, ...base, email: 'tomado@mail.com' },
    { row: 3, ...base, dni: '28999888' },
    { row: 4, ...base, dni: '30111222' },
    { row: 5, ...base, dni: '41000111', sport: 'hockey' },
  ];

  it('previews without creating anything and flags existing players', async () => {
    const { prisma, service } = setup();
    const result = await service.run({ uid: 'admin' }, 'c1', rows, true);
    expect(prisma.player.create).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      total: 4,
      ok: 0,
      warning: 1,
      error: 1,
      duplicate: 2,
    });
    expect(result.results[0].warnings.join(' ')).toMatch(
      /ya está en otra ficha/,
    );
    expect(result.results[1].errors[0]).toMatch(/Ya existe: Ana Gómez/);
    expect(result.results[2].errors[0]).toMatch(/consola del club/);
  });

  it('creates the importable rows in the database and the club console, with audit', async () => {
    const { prisma, batch, audit, service } = setup();
    const result = await service.run(
      { uid: 'admin', email: 'a@fluxion.app' },
      'c1',
      rows,
      false,
    );
    expect(result.created).toBe(1);
    expect(prisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'co1',
        clubId: 'c1',
        dni: '45123456',
        email: null,
        firstName: 'Juan Carlos',
      }),
      select: { id: true },
    });
    expect(batch.set).toHaveBeenCalledWith(
      { id: 'p1' },
      expect.objectContaining({
        sport: 'football',
        divisionId: 'd1',
        divisionName: 'Sub 15',
        gender: 'Masculino',
        branch: 'masculino',
        role: 'player',
        status: 'active',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      { uid: 'admin', email: 'a@fluxion.app' },
      'players.import',
      { type: 'Club', id: 'c1' },
      expect.objectContaining({
        after: expect.objectContaining({ created: 1, rows: 4 }),
      }),
    );
  });
});
