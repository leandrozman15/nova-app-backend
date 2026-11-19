import {
  loadGuardianNews,
  visibleToGuardian,
  type NewsChild,
} from './guardian-news';

const kid: NewsChild = {
  companyId: 'co',
  clubId: 'c1',
  clubName: 'Club',
  sport: 'football',
  divisionId: 'd1',
  teamId: 't1',
};

describe('visibleToGuardian', () => {
  it('muestra novedades sin destinatarios', () => {
    expect(visibleToGuardian({}, [kid])).toBe(true);
  });
  it('muestra las de atletas o familias y oculta las solo para socios o hinchas', () => {
    expect(
      visibleToGuardian({ targets: { segments: ['athletes'] } }, [kid]),
    ).toBe(true);
    expect(
      visibleToGuardian({ targets: { segments: ['families'] } }, [kid]),
    ).toBe(true);
    expect(
      visibleToGuardian({ targets: { segments: ['members'] } }, [kid]),
    ).toBe(false);
    expect(visibleToGuardian({ targets: { segments: ['fans'] } }, [kid])).toBe(
      false,
    );
  });
  it('respeta disciplina y categoría del hijo', () => {
    expect(
      visibleToGuardian({ targets: { disciplineIds: ['hockey'] } }, [kid]),
    ).toBe(false);
    expect(
      visibleToGuardian(
        { targets: { disciplineIds: ['football'], divisionIds: ['t1'] } },
        [kid],
      ),
    ).toBe(true);
    expect(visibleToGuardian({ targets: { divisionIds: ['t9'] } }, [kid])).toBe(
      false,
    );
  });
  it('acepta la disciplina guardada con el id del club', () => {
    const ev = {
      clubId: 'c1',
      targets: {
        segments: ['members', 'athletes'],
        disciplineIds: ['c1_football', 'c1_hockey'],
      },
    };
    expect(visibleToGuardian(ev, [kid])).toBe(true);
    expect(
      visibleToGuardian({ ...ev, targets: { disciplineIds: ['c1_hockey'] } }, [
        kid,
      ]),
    ).toBe(false);
  });

  it('oculta las vencidas', () => {
    expect(
      visibleToGuardian({ expiresAt: '2020-01-01T00:00:00Z' }, [kid]),
    ).toBe(false);
  });
});

describe('loadGuardianNews', () => {
  it('lee las novedades del club del hijo, filtra y ordena', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { docId: 'a', data: { title: 'Vieja', createdAt: '2026-01-01' } },
      { docId: 'b', data: { title: 'Nueva', createdAt: '2026-02-01' } },
      {
        docId: 'c',
        data: {
          title: 'Socios',
          createdAt: '2026-03-01',
          targets: { segments: ['members'] },
        },
      },
    ]);
    const news = await loadGuardianNews({ storeDocument: { findMany } }, [kid]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'co', parentPath: 'clubs/c1/special_events' },
      }),
    );
    expect(news.map((n) => n.id)).toEqual(['b', 'a']);
    expect(news[0]).toMatchObject({ clubId: 'c1', clubName: 'Club' });
  });
});
