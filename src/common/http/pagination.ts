export type PaginationParams = {
  skip?: number;
  take?: number;
};

export function parseBooleanFlag(value?: string): boolean {
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true';
}

export function parsePagination(
  limit?: string,
  offset?: string,
  maxPageSize = 200,
): PaginationParams {
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);

  const take = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, maxPageSize)
    : undefined;

  const skip = Number.isFinite(parsedOffset) && parsedOffset >= 0
    ? parsedOffset
    : undefined;

  return { skip, take };
}
