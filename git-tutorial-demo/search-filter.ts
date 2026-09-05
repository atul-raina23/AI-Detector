/**
 * Search & Filter Helper
 * Provides case-insensitive keyword searching across object properties.
 */

export function filterByKeyword<T extends Record<string, unknown>>(
  items: T[],
  keyword: string,
  searchableKeys?: (keyof T)[]
): T[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return items;

  return items.filter((item) => {
    const keys = searchableKeys ?? (Object.keys(item) as (keyof T)[]);

    return keys.some((key) => {
      const value = item[key];
      if (value === null || value === undefined) return false;
      return String(value).toLowerCase().includes(normalized);
    });
  });
}

export function sortItems<T extends Record<string, unknown>>(
  items: T[],
  sortBy: keyof T,
  order: 'asc' | 'desc' = 'asc'
): T[] {
  return [...items].sort((a, b) => {
    const valA = a[sortBy];
    const valB = b[sortBy];

    if (valA === valB) return 0;
    if (valA === null || valA === undefined) return order === 'asc' ? 1 : -1;
    if (valB === null || valB === undefined) return order === 'asc' ? -1 : 1;

    if (typeof valA === 'string' && typeof valB === 'string') {
      const comparison = valA.localeCompare(valB);
      return order === 'asc' ? comparison : -comparison;
    }

    if (valA < valB) return order === 'asc' ? -1 : 1;
    return order === 'asc' ? 1 : -1;
  });
}

export interface PaginationResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
}

export function paginateResults<T>(items: T[], page = 1, pageSize = 10): PaginationResult<T> {
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const validPage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (validPage - 1) * pageSize;
  const data = items.slice(startIndex, startIndex + pageSize);

  return {
    data,
    page: validPage,
    pageSize,
    totalPages,
    totalItems,
  };
}

