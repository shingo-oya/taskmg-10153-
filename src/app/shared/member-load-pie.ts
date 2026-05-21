import type { MemberLoadRow } from '../services/dashboard/dashboard.types';

export interface MemberLoadPieSlice extends MemberLoadRow {
  percent: number;
  color: string;
  path: string;
}

/** メンバー別負荷円グラフ用（明るめの緑系） */
const SLICE_COLORS = [
  '#7bc67e',
  '#9ed4a0',
  '#6dbf70',
  '#b5e0b6',
  '#5cb860',
  '#c8ebc9',
  '#8fd492',
  '#a8ddb0',
  '#4fad55',
  '#d4f0d5',
  '#72c975',
  '#e2f5e3',
];

export function buildMemberLoadPieSlices(
  rows: readonly MemberLoadRow[],
  cx = 100,
  cy = 100,
  radius = 82,
): MemberLoadPieSlice[] {
  const total = rows.reduce((sum, r) => sum + r.openTaskCount, 0);
  if (total <= 0 || rows.length === 0) {
    return [];
  }

  if (rows.length === 1) {
    const row = rows[0];
    return [
      {
        ...row,
        percent: 100,
        color: SLICE_COLORS[0],
        path: `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`,
      },
    ];
  }

  let startAngle = -90;
  const slices: MemberLoadPieSlice[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sweep = (row.openTaskCount / total) * 360;
    const endAngle = startAngle + sweep;
    slices.push({
      ...row,
      percent: Math.round((row.openTaskCount / total) * 1000) / 10,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
      path: describeWedge(cx, cy, radius, startAngle, endAngle),
    });
    startAngle = endAngle;
  }

  return slices;
}

function describeWedge(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round((cx + r * Math.cos(rad)) * 100) / 100,
    y: Math.round((cy + r * Math.sin(rad)) * 100) / 100,
  };
}
