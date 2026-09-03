export interface PageParams {
  page: number;
  pageSize: number;
}

export function parsePageParams(query: Record<string, unknown>, defaultPageSize = 20, maxPageSize = 50): PageParams {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, Number(query.pageSize) || defaultPageSize));
  return { page, pageSize };
}

export function toSkipTake({ page, pageSize }: PageParams) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
