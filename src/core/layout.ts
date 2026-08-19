import type { RowRangeQuery } from "./contracts";

export const TIMELINE_ROW_HEIGHT = 26;

export function visibleTimelineRowQuery(
  rowCount: number,
  viewportTop: number,
  viewportHeight: number,
  rowHeight = TIMELINE_ROW_HEIGHT,
): RowRangeQuery {
  const total = Number.isFinite(rowCount) ? Math.max(0, Math.floor(rowCount)) : 0;
  const top = Number.isFinite(viewportTop) ? Math.max(0, viewportTop) : 0;
  const height = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  const safeRowHeight = Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : TIMELINE_ROW_HEIGHT;
  const start = Math.min(total, Math.floor(top / safeRowHeight));
  const end = Math.min(total, Math.ceil((top + height) / safeRowHeight) + 1);
  return { start, count: Math.max(0, end - start) };
}
