export const PROJECT_CATEGORIES = ['infrastructure', 'event', 'program', 'equipment', 'other'] as const;
export const PROJECT_PRIORITIES = ['low', 'medium', 'high'] as const;
export const PROJECT_STATUSES = ['draft', 'budgeting', 'approved', 'in_progress', 'paused', 'completed', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const NEXT: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ['budgeting', 'cancelled'],
  budgeting: ['approved', 'draft', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  in_progress: ['paused', 'completed', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function nextStatuses(from: string): ProjectStatus[] {
  return NEXT[from as ProjectStatus] ?? [];
}

export function canMoveProject(from: string, to: string): boolean {
  return nextStatuses(from).includes(to as ProjectStatus);
}

/** Cerrados: no se editan renglones ni datos. */
export function isClosed(status: string): boolean {
  return status === 'completed' || status === 'cancelled';
}

export type LineLike = { plannedAmount: number; spentAmount: number };
export type BudgetTotals = { planned: number; spent: number; remaining: number; executionPct: number; overBudget: boolean };

export function budgetTotals(lines: LineLike[]): BudgetTotals {
  const planned = lines.reduce((a, l) => a + l.plannedAmount, 0);
  const spent = lines.reduce((a, l) => a + l.spentAmount, 0);
  return {
    planned,
    spent,
    remaining: planned - spent,
    executionPct: planned > 0 ? Math.round((spent / planned) * 100) : 0,
    overBudget: spent > planned,
  };
}

/** Un proyecto solo se aprueba si tiene presupuesto cargado. */
export function approvalBlocker(to: string, lines: LineLike[]): string | null {
  if (to === 'approved' && budgetTotals(lines).planned <= 0) {
    return 'Cargá al menos un renglón de presupuesto antes de aprobar el proyecto';
  }
  return null;
}
