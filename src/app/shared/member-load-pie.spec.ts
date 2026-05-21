import { buildMemberLoadPieSlices } from './member-load-pie';

describe('buildMemberLoadPieSlices', () => {
  it('returns empty for no rows', () => {
    expect(buildMemberLoadPieSlices([])).toEqual([]);
  });

  it('builds slices that sum to 100%', () => {
    const slices = buildMemberLoadPieSlices([
      { memberName: 'A', openTaskCount: 2 },
      { memberName: 'B', openTaskCount: 1 },
    ]);
    expect(slices.length).toBe(2);
    expect(slices[0].percent + slices[1].percent).toBe(100);
    expect(slices[0].path).toContain('M');
  });
});
