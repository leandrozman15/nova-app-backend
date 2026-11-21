import {
  availabilityProblem,
  capacityFor,
  freeSlotsForDay,
  packToUse,
  requestProblem,
  slugify,
  studentBalance,
  cleanSkills,
} from './coach-rules';

const h = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));

describe('reglas de profes', () => {
  it('arma el slug y el cupo', () => {
    expect(slugify('Juan Pérez Ñandú')).toBe('juan-perez-nandu');
    expect(capacityFor('INDIVIDUAL', 5)).toBe(1);
    expect(capacityFor('DUO')).toBe(2);
    expect(capacityFor('GROUP', 20)).toBe(12);
    expect(capacityFor('GROUP', 1)).toBe(3);
  });

  it('valida franjas que se pisan', () => {
    expect(
      availabilityProblem([
        { weekday: 1, startMinute: h('17:00'), endMinute: h('20:00') },
      ]),
    ).toBeNull();
    expect(
      availabilityProblem([
        { weekday: 1, startMinute: h('17:00'), endMinute: h('20:00') },
        { weekday: 1, startMinute: h('19:00'), endMinute: h('21:00') },
      ]),
    ).toMatch(/pisan/);
    expect(
      availabilityProblem([
        { weekday: 1, startMinute: h('20:00'), endMinute: h('19:00') },
      ]),
    ).toMatch(/terminar/);
  });

  it('calcula horarios libres sin pisar clases, bloqueos ni la cancha ocupada', () => {
    const windows = [
      {
        id: 'w1',
        weekday: 2,
        startMinute: h('17:00'),
        endMinute: h('21:00'),
        clubId: 'c1',
        facilityId: 'f1',
      },
      { id: 'w2', weekday: 3, startMinute: h('09:00'), endMinute: h('11:00') },
    ];
    const slots = freeSlotsForDay({
      weekday: 2,
      windows,
      duration: 60,
      busy: [{ start: h('18:00'), end: h('19:00') }],
      courtBusy: { f1: [{ start: h('20:00'), end: h('21:00') }] },
    });
    expect(slots.map((s) => s.startMinute)).toEqual([h('17:00'), h('19:00')]);
    expect(slots[0]).toMatchObject({
      availabilityId: 'w1',
      clubId: 'c1',
      facilityId: 'f1',
    });
    // Hoy: hace falta anticipación (por defecto 2 horas).
    const today = freeSlotsForDay({
      weekday: 2,
      windows,
      duration: 60,
      busy: [],
      nowMinute: h('16:30'),
    });
    expect(today[0].startMinute).toBe(h('18:30'));
  });

  it('descuenta del pack más viejo con clases y sin vencer', () => {
    const packs = [
      { id: 'nuevo', totalClasses: 8, usedClasses: 0, createdAt: '2026-11-10' },
      { id: 'viejo', totalClasses: 4, usedClasses: 4, createdAt: '2026-10-01' },
      {
        id: 'vencido',
        totalClasses: 4,
        usedClasses: 1,
        createdAt: '2026-09-01',
        expiresAt: '2026-10-31',
      },
    ];
    expect(packToUse(packs, '2026-11-20')?.id).toBe('nuevo');
    expect(packToUse([packs[1]], '2026-11-20')).toBeNull();
  });

  it('calcula el saldo del alumno', () => {
    expect(
      studentBalance({
        packs: [
          {
            totalClasses: 8,
            usedClasses: 3,
            price: '64000',
            paidAmount: '40000',
          },
        ],
        unpaidLessons: [{ price: '9000' }, { price: 9000 }],
      }),
    ).toEqual({
      packsDue: 24000,
      lessonsDue: 18000,
      total: 42000,
      classesLeft: 5,
    });
  });

  it('valida la fecha pedida', () => {
    expect(
      requestProblem({
        date: '2026-11-19',
        today: '2026-11-20',
        startMinute: 600,
        duration: 60,
      }),
    ).toMatch(/pasó/);
    expect(
      requestProblem({
        date: '2027-03-01',
        today: '2026-11-20',
        startMinute: 600,
        duration: 60,
      }),
    ).toMatch(/anticipación/);
    expect(
      requestProblem({
        date: '2026-11-21',
        today: '2026-11-20',
        startMinute: 600,
        duration: 60,
      }),
    ).toBeNull();
  });
});

describe('ficha del alumno', () => {
  it('deja solo golpes conocidos con nota de 1 a 5', () => {
    expect(
      cleanSkills({
        drive: 4,
        bandeja: 6,
        vibora: 2.5,
        inventado: 3,
        remate: '3',
      }),
    ).toEqual({ drive: 4, remate: 3 });
    expect(cleanSkills({})).toBeNull();
    expect(cleanSkills('x')).toBeNull();
  });
});
