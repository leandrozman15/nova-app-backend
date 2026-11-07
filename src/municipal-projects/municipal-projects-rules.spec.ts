import { approvalBlocker, budgetTotals, canMoveProject, isClosed, nextStatuses } from './municipal-projects-rules';

describe('municipal-projects-rules', () => {
  it('flujo de estados válido', () => {
    expect(canMoveProject('draft', 'budgeting')).toBe(true);
    expect(canMoveProject('budgeting', 'approved')).toBe(true);
    expect(canMoveProject('approved', 'in_progress')).toBe(true);
    expect(canMoveProject('paused', 'in_progress')).toBe(true);
  });
  it('no permite saltos ni salir de estados cerrados', () => {
    expect(canMoveProject('draft', 'in_progress')).toBe(false);
    expect(nextStatuses('completed')).toEqual([]);
    expect(canMoveProject('cancelled', 'draft')).toBe(false);
    expect(nextStatuses('xxx')).toEqual([]);
    expect(isClosed('completed')).toBe(true);
    expect(isClosed('paused')).toBe(false);
  });
  it('totales de presupuesto', () => {
    const t = budgetTotals([{ plannedAmount: 1000, spentAmount: 400 }, { plannedAmount: 500, spentAmount: 200 }]);
    expect(t).toEqual({ planned: 1500, spent: 600, remaining: 900, executionPct: 40, overBudget: false });
    expect(budgetTotals([]).executionPct).toBe(0);
    expect(budgetTotals([{ plannedAmount: 100, spentAmount: 150 }]).overBudget).toBe(true);
  });
  it('exige presupuesto para aprobar', () => {
    expect(approvalBlocker('approved', [])).toMatch(/presupuesto/);
    expect(approvalBlocker('approved', [{ plannedAmount: 10, spentAmount: 0 }])).toBeNull();
    expect(approvalBlocker('budgeting', [])).toBeNull();
  });
});
