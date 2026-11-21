import {
  activityCaption,
  activityStoryGroups,
  priceLabel,
  scheduleLines,
  coachSource,
  tournamentSource,
} from './activity-story';

describe('historia de actividad', () => {
  it('une días con el mismo horario', () => {
    expect(
      scheduleLines([
        { day: 2, start: '18:00', end: '19:30' },
        { day: 0, start: '18:00', end: '19:30' },
        { day: 4, start: '18:00', end: '19:30' },
        { day: 5, start: '10:00', end: '12:00' },
      ]),
    ).toEqual(['Lun, Mié y Vie · 18:00 a 19:30', 'Sáb · 10:00 a 12:00']);
  });

  it('arma los grupos elegidos con sus profes y el valor', () => {
    const groups = activityStoryGroups(
      {
        id: 'disc_hockey',
        name: 'Hockey',
        coaches: ['Coordinación'],
        groups: [
          {
            name: 'Sub 12',
            schedule: [{ day: 1, start: '17:00', end: '18:30' }],
            coaches: ['Ana Demo'],
          },
          {
            name: 'Primera',
            schedule: [{ day: 3, start: '20:00', end: '21:30' }],
            coaches: [],
          },
        ],
      },
      ['Primera'],
    );
    expect(groups).toEqual([
      {
        name: 'Primera',
        lines: ['Jue · 20:00 a 21:30'],
        coaches: ['Coordinación'],
      },
    ]);
    expect(priceLabel(18000, 'mes')).toMatch(/18\.000 por mes$/);
    expect(priceLabel(0, 'mes')).toBeNull();
    expect(
      activityCaption({
        clubName: 'Club Demo',
        title: 'Hockey',
        highlight: 'Inscripciones abiertas',
        groups,
        price: null,
        contact: 'Tel. 1100000000',
      }),
    ).toBe(
      'Hockey en Club Demo\nInscripciones abiertas\n\nPrimera\nJue · 20:00 a 21:30\nProfe: Coordinación\n\nInscripciones: Tel. 1100000000',
    );
  });
});

describe('historias de campeonatos y de profes de pádel', () => {
  it('campeonato: fechas, inscripción con cupo y premios', () => {
    const s = tournamentSource({
      id: 't1',
      name: 'Americano de Pádel',
      category: 'Mixto',
      entryType: 'pareja',
      days: [{ date: '2026-11-28', start: '09:00', end: '20:00' }],
      venues: [{ name: 'Club Demo' }],
      registrationFee: 30000,
      feeUnit: 'por pareja',
      registrationDeadline: '2026-11-26',
      prizes: ['1° Paletas', '2° Bolsos'],
      spotsLeft: 4,
    });
    expect(s.id).toBe('torneo:t1');
    expect(s.audience).toBe('Mixto · Parejas');
    const groups = activityStoryGroups(s);
    expect(groups[0]).toEqual({
      name: 'Cuándo · Club Demo',
      lines: ['Sáb 28/11 · 09:00 a 20:00'],
      coaches: [],
    });
    expect(groups[1].lines).toEqual([
      '$\u00a030.000 por pareja',
      'Hasta el 26/11',
      'Quedan 4 lugares',
    ]);
    expect(groups[2].lines).toEqual(['1° Paletas', '2° Bolsos']);
  });

  it('profe: clases con precio, días (lunes primero) y grupales con lugar', () => {
    const s = coachSource({
      id: 'c1',
      displayName: 'Martín Demo',
      levels: ['iniciacion', '7ma'],
      classTypes: [
        {
          name: 'Individual',
          format: 'INDIVIDUAL',
          price: 25000,
          durationMinutes: 60,
        },
      ],
      weekly: [
        { weekday: 1, startMinute: 1020, endMinute: 1320 },
        { weekday: 3, startMinute: 1020, endMinute: 1320 },
      ],
      groups: [
        { date: '2026-11-25', startMinute: 1140, name: 'Grupal', spotsLeft: 2 },
      ],
    });
    expect(s.name).toBe('Clases de pádel con Martín Demo');
    expect(s.audience).toBe('Iniciación, 7ma');
    const groups = activityStoryGroups(s);
    expect(groups.map((g) => g.lines)).toEqual([
      ['Individual · $\u00a025.000'],
      ['Lun y Mié · 17:00 a 22:00'],
      ['Mié 25/11 · 19:00 · 2 lugares'],
    ]);
  });
});
