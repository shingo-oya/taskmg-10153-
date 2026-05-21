export type ListSortDir = 'asc' | 'desc';

export type ListSortState<K extends string> = { key: K; dir: ListSortDir } | null;

const PRIORITY_ORDER = ['急', '高', '中', '低'] as const;

export function cycleListSort<K extends string>(cur: ListSortState<K>, key: K): ListSortState<K> {
  if (cur === null || cur.key !== key) {
    return { key, dir: 'asc' };
  }
  if (cur.dir === 'asc') {
    return { key, dir: 'desc' };
  }
  return null;
}

export function ariaSortForColumn<K extends string>(
  cur: ListSortState<K>,
  key: K,
): 'ascending' | 'descending' | 'none' {
  if (!cur || cur.key !== key) {
    return 'none';
  }
  return cur.dir === 'asc' ? 'ascending' : 'descending';
}

export function compareText(a: string, b: string, dir: ListSortDir): number {
  const m = dir === 'asc' ? 1 : -1;
  return a.localeCompare(b, 'ja') * m;
}

export function compareDateStrings(a: string, b: string, dir: ListSortDir): number {
  const av = a.trim();
  const bv = b.trim();
  if (!av && !bv) {
    return 0;
  }
  if (!av) {
    return dir === 'asc' ? 1 : -1;
  }
  if (!bv) {
    return dir === 'asc' ? -1 : 1;
  }
  const m = dir === 'asc' ? 1 : -1;
  return av.localeCompare(bv) * m;
}

export function compareNumber(a: number, b: number, dir: ListSortDir): number {
  return (a - b) * (dir === 'asc' ? 1 : -1);
}

export function comparePriority(a: string, b: string, dir: ListSortDir): number {
  const ai = PRIORITY_ORDER.indexOf(a as (typeof PRIORITY_ORDER)[number]);
  const bi = PRIORITY_ORDER.indexOf(b as (typeof PRIORITY_ORDER)[number]);
  const aRank = ai >= 0 ? ai : PRIORITY_ORDER.length;
  const bRank = bi >= 0 ? bi : PRIORITY_ORDER.length;
  return compareNumber(aRank, bRank, dir);
}
