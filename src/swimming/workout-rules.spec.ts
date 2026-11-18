import {
  isValidWorkoutDistance,
  summarizeWorkout,
  workoutEntriesProblem,
} from './workout-rules';

describe('workout rules', () => {
  it('acepta distancias de entrenamiento de 25 en 25', () => {
    expect(isValidWorkoutDistance(75)).toBe(true);
    expect(isValidWorkoutDistance(30)).toBe(false);
    expect(isValidWorkoutDistance(1525)).toBe(false);
  });

  it('detecta repeticiones fuera de la serie, repetidas o sin tiempo', () => {
    expect(
      workoutEntriesProblem(
        [{ playerId: 'a', rep: 1, timeMs: 30000, status: 'ok' }],
        4,
      ),
    ).toBeNull();
    expect(
      workoutEntriesProblem(
        [{ playerId: 'a', rep: 5, timeMs: 30000, status: 'ok' }],
        4,
      ),
    ).toMatch(/no existe/);
    expect(
      workoutEntriesProblem(
        [
          { playerId: 'a', rep: 1, timeMs: 30000, status: 'ok' },
          { playerId: 'a', rep: 1, timeMs: 31000, status: 'ok' },
        ],
        4,
      ),
    ).toMatch(/dos veces/);
    expect(
      workoutEntriesProblem(
        [{ playerId: 'a', rep: 1, timeMs: 0, status: 'ok' }],
        4,
      ),
    ).toMatch(/mayor a cero/);
    expect(
      workoutEntriesProblem(
        [{ playerId: 'a', rep: 1, timeMs: 0, status: 'dnf' }],
        4,
      ),
    ).toBeNull();
  });

  it('resume cada nadador: promedio, mejor, peor, dispersión y caída', () => {
    const [s] = summarizeWorkout(
      [
        { playerId: 'a', rep: 1, timeMs: 30000, status: 'ok' },
        { playerId: 'a', rep: 2, timeMs: 31000, status: 'ok' },
        { playerId: 'a', rep: 3, timeMs: 32000, status: 'ok' },
        { playerId: 'a', rep: 4, timeMs: 33000, status: 'ok' },
      ],
      4,
    );
    expect(s).toMatchObject({
      completed: 4,
      avgMs: 31500,
      bestMs: 30000,
      worstMs: 33000,
      spreadMs: 3000,
      fadeMs: 2000,
    });
  });

  it('deja en null las repeticiones que no hizo', () => {
    const [s] = summarizeWorkout(
      [
        { playerId: 'a', rep: 1, timeMs: 30000, status: 'ok' },
        { playerId: 'a', rep: 3, timeMs: 0, status: 'dnf' },
      ],
      3,
    );
    expect(s.times).toEqual([30000, null, null]);
    expect(s.completed).toBe(1);
    expect(s.fadeMs).toBeNull();
  });
});
