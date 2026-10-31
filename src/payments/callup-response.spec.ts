import { respondToCallup } from './callup-response';

describe('respondToCallup', () => {
  const doc = { data: { playerId: 'p1', published: true, status: 'pending', eventTitle: 'Amistoso' } };

  it('actualiza el estado de una citación del fixture del club y conserva el resto', async () => {
    const update = jest.fn();
    const prisma: any = { matchCallup: {}, storeDocument: { findUnique: jest.fn().mockResolvedValue(doc), update } };
    const r = await respondToCallup(prisma, { playerId: 'p1', callupId: 'fx:e1_p1', status: 'confirmed', by: 'guardian' });
    expect(r).toEqual({ id: 'fx:e1_p1', status: 'confirmed' });
    expect(prisma.storeDocument.findUnique).toHaveBeenCalledWith({ where: { path: 'match_callups/e1_p1' }, select: { data: true } });
    const saved = update.mock.calls[0][0].data.data;
    expect(saved).toMatchObject({ eventTitle: 'Amistoso', status: 'confirmed', respondedBy: 'guardian' });
  });

  it('no deja responder la citación de otro jugador ni una sin publicar', async () => {
    const prisma: any = { matchCallup: {}, storeDocument: { findUnique: jest.fn().mockResolvedValue({ data: { playerId: 'otro', published: true } }), update: jest.fn() } };
    await expect(respondToCallup(prisma, { playerId: 'p1', callupId: 'fx:x', status: 'confirmed', by: 'player' })).rejects.toThrow('no encontrada');
    prisma.storeDocument.findUnique.mockResolvedValue({ data: { playerId: 'p1', published: false } });
    await expect(respondToCallup(prisma, { playerId: 'p1', callupId: 'fx:x', status: 'confirmed', by: 'player' })).rejects.toThrow('no encontrada');
    expect(prisma.storeDocument.update).not.toHaveBeenCalled();
  });

  it('actualiza las citaciones de liga solo del propio jugador', async () => {
    const prisma: any = { storeDocument: {}, matchCallup: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }), update: jest.fn() } };
    await respondToCallup(prisma, { playerId: 'p1', callupId: 'lg:c1', status: 'unavailable', by: 'player' });
    expect(prisma.matchCallup.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'c1', playerExternalId: 'p1' }) }));
    expect(prisma.matchCallup.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'unavailable' } });
  });

  it('rechaza estados inválidos', async () => {
    await expect(respondToCallup({} as any, { playerId: 'p1', callupId: 'fx:a', status: 'maybe', by: 'player' })).rejects.toThrow('inválido');
  });
});
