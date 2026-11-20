import { activityCaption, activityStoryGroups, priceLabel, scheduleLines } from './activity-story';

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
          { name: 'Sub 12', schedule: [{ day: 1, start: '17:00', end: '18:30' }], coaches: ['Ana Demo'] },
          { name: 'Primera', schedule: [{ day: 3, start: '20:00', end: '21:30' }], coaches: [] },
        ],
      },
      ['Primera'],
    );
    expect(groups).toEqual([{ name: 'Primera', lines: ['Jue · 20:00 a 21:30'], coaches: ['Coordinación'] }]);
    expect(priceLabel(18000, 'mes')).toMatch(/18\.000 por mes$/);
    expect(priceLabel(0, 'mes')).toBeNull();
    expect(activityCaption({ clubName: 'Club Demo', title: 'Hockey', highlight: 'Inscripciones abiertas', groups, price: null, contact: 'Tel. 1100000000' })).toBe(
      'Hockey en Club Demo\nInscripciones abiertas\n\nPrimera\nJue · 20:00 a 21:30\nProfe: Coordinación\n\nInscripciones: Tel. 1100000000',
    );
  });
});
