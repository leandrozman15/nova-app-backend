jest.mock('../firebase/firebase-admin.service', () => ({
  FirebaseAdminService: class FirebaseAdminService {},
}));

import {
  describeAudience,
  teamSchedule,
  toPublicDiscipline,
} from './club-disciplines.service';

describe('club disciplines (Firestore → app)', () => {
  it('describes gender and ages like the console card', () => {
    expect(
      describeAudience({ gender: 'both', minAge: '6', maxAge: '50' }),
    ).toBe('Mixto · 6 a 50 años');
    expect(
      describeAudience({ gender: 'male', minAge: '6', maxAge: '99' }),
    ).toBe('Masculino · desde 6 años');
    expect(describeAudience({})).toBeNull();
  });

  it('turns a squad training plan into weekly slots', () => {
    expect(
      teamSchedule({
        trainingDays: ['Mié', 'Lun', 'Lun', 'Sab'],
        trainingStartTime: '18:30',
        trainingEndTime: '20:00',
      }),
    ).toEqual([
      { day: 0, start: '18:30', end: '20:00' },
      { day: 2, start: '18:30', end: '20:00' },
      { day: 5, start: '18:30', end: '20:00' },
    ]);
    expect(
      teamSchedule({
        trainingDays: ['Lun'],
        trainingStartTime: '20:00',
        trainingEndTime: '18:00',
      }),
    ).toEqual([]);
  });

  it('maps a discipline with its squads, hiding coaches unless allowed', () => {
    const discipline = {
      customName: 'Hockey',
      sportId: 'hockey',
      emoji: '🏑',
      season: '2025',
      gender: 'female',
      minAge: '9',
      maxAge: '40',
      coordinatorName: 'Luciana Sosa',
    };
    const teams = [
      {
        name: 'Primera',
        coachName: 'Juan Pérez',
        trainingDays: ['Mar', 'Jue'],
        trainingStartTime: '19:00',
        trainingEndTime: '20:30',
      },
      { name: 'Vieja', status: 'inactive', trainingDays: ['Lun'] },
    ];

    const open = toPublicDiscipline('hockey', discipline, teams, true);
    expect(open).toEqual(
      expect.objectContaining({
        id: 'disc_hockey',
        name: 'Hockey',
        audience: 'Femenino · 9 a 40 años',
        coaches: ['Luciana Sosa'],
      }),
    );
    expect(open.groups).toEqual([
      {
        name: 'Primera',
        coaches: ['Juan Pérez'],
        schedule: [
          { day: 1, start: '19:00', end: '20:30' },
          { day: 3, start: '19:00', end: '20:30' },
        ],
      },
    ]);

    const closed = toPublicDiscipline('hockey', discipline, teams, false);
    expect(closed.coaches).toEqual([]);
    expect(closed.groups[0].coaches).toEqual([]);
  });

  it('ignores the "No asignado" placeholder', () => {
    const result = toPublicDiscipline(
      'rugby',
      { customName: 'Rugby', coordinatorName: 'No asignado' },
      [],
      true,
    );
    expect(result.coaches).toEqual([]);
  });
});
