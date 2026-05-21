import {
  buildMemberLoadFromTasks,
  buildTaskUpdateItems,
  classifyTaskDueBucket,
  countDelayedProjects,
  filterProjectsDue,
  filterProjectsForOrg,
  isProjectDelayed,
  todayIsoDate,
} from './dashboard-query';
import type { ProjectRow } from '../../components/project-list/project-row';
import type { TaskRow } from '../../components/task-list/task-row';
import { withUpdateLogId } from '../../shared/update-log-id';
describe('dashboard-query', () => {
  it('classifyTaskDueBucket excludes today from soon', () => {
    const today = '2026-05-18';
    expect(classifyTaskDueBucket('2026-05-18', today)).toBe('today');
    expect(classifyTaskDueBucket('2026-05-19', today)).toBe('soon');
    expect(classifyTaskDueBucket('2026-05-25', today)).toBe('soon');
    expect(classifyTaskDueBucket('2026-05-26', today)).toBeNull();
    expect(classifyTaskDueBucket('2026-05-17', today)).toBe('overdue');
  });

  it('isProjectDelayed when progress is behind elapsed time', () => {
    const project: ProjectRow = {
      managementNumber: 'PRJ-TEST',
      name: 'Test',
      description: '',
      departments: [],
      endDate: '2026-08-26',
      priority: '中',
      registeredAt: '2026-05-18',
      workStartDate: '2026-05-18',
      completedAt: '',
      status: '着手中',
      progressPercent: 60,
      approver: '',
      participants: [],
      members: [],
      milestones: [],
      resourceFolders: [],
      relatedIssues: [],
      updateHistory: [],
      lastUpdatedAt: '',
      lastUpdatedBy: '',
    };
    const today = '2026-08-06';
    expect(isProjectDelayed(project, [], today)).toBe(true);
  });

  it('update item ids stay stable when a new history entry is prepended', () => {
    const task: TaskRow = {
      managementNumber: '1',
      name: 'T',
      type: '開発',
      managementNo: 'TSK-900',
      taskname: 'テスト課題',
      taskContent: '',
      creator: '山田太郎',
      departments: [],
      members: '山田太郎',
      endDate: '2026-06-01',
      priority: '中',
      status: '未着手',
      registeredOn: '2026-05-01',
      startedOn: '',
      completedOn: '',
      approver: '',
      progressPercent: 0,
      lastUpdatedAt: '2026-05-01',
      lastUpdatedBy: '山田太郎',
      participants: [{ department: '開発', name: '山田太郎' }],
      resourceFolders: [],
      updateHistory: [
        { at: '2026-05-02', by: '山田太郎', summary: '2件目' },
        { at: '2026-05-01', by: '山田太郎', summary: '1件目' },
      ],
    };
    const before = buildTaskUpdateItems([task], '山田太郎').map((u) => u.id);

    const afterTask: TaskRow = {
      ...task,
      updateHistory: [
        withUpdateLogId({ at: '2026-05-03T12:00:00.000Z', by: '山田太郎', summary: '新規更新' }),
        ...(task.updateHistory ?? []),
      ],
    };
    const after = buildTaskUpdateItems([afterTask], '山田太郎').map((u) => u.id);

    expect(after.length).toBe(before.length + 1);
    expect(after.slice(1)).toEqual(before);
  });

  it('filterProjectsDue uses same bucket rules as tasks', () => {
    const projects: ProjectRow[] = [
      {
        managementNumber: 'PRJ-A',
        name: 'A',
        description: '',
        departments: ['開発部'],
        endDate: '2026-05-18',
        priority: '中',
        registeredAt: '2026-05-01',
        workStartDate: '2026-05-01',
        completedAt: '',
        status: '着手中',
        progressPercent: 50,
        approver: '',
        participants: [],
        members: [],
        milestones: [],
        resourceFolders: [],
        relatedIssues: [],
        updateHistory: [],
        lastUpdatedAt: '',
        lastUpdatedBy: '',
      },
    ];
    const today = '2026-05-18';
    expect(filterProjectsDue(projects, today, 'today').length).toBe(1);
    expect(filterProjectsDue(projects, today, 'soon').length).toBe(0);
  });

  it('filterProjectsForOrg filters by department and project', () => {
    const projects: ProjectRow[] = [
      mkProject('PRJ-1', ['開発部']),
      mkProject('PRJ-2', ['営業第一部']),
    ];
    expect(filterProjectsForOrg(projects, { department: '開発部', projectManagementNumber: '' }).length).toBe(
      1,
    );
    expect(
      filterProjectsForOrg(projects, { department: '', projectManagementNumber: 'PRJ-2' }).length,
    ).toBe(1);
  });

  it('buildMemberLoadFromTasks filters assignees by member department when set', () => {
    const tasks: TaskRow[] = [
      {
        managementNumber: 'PRJ-1',
        name: 'T',
        type: '開発',
        managementNo: 'TK-1',
        taskname: '課題A',
        taskContent: '',
        creator: '',
        departments: [],
        members: '',
        endDate: '2026-06-01',
        priority: '中',
        status: '未着手',
        registeredOn: '',
        startedOn: '',
        completedOn: '',
        approver: '',
        progressPercent: 0,
        lastUpdatedAt: '',
        lastUpdatedBy: '',
        participants: [
          { department: '開発部', name: '鈴木一郎' },
          { department: '営業第一部', name: '山田太郎' },
        ],
        resourceFolders: [],
        updateHistory: [],
      },
    ];
    const nameToDepartment = new Map([
      ['鈴木一郎', '開発部'],
      ['山田太郎', '営業第一部'],
    ]);
    const load = buildMemberLoadFromTasks(tasks, {
      memberDepartment: '開発部',
      nameToDepartment,
    });
    expect(load.length).toBe(1);
    expect(load[0].memberName).toBe('鈴木一郎');
  });

  it('countDelayedProjects counts delayed only', () => {
    const project = mkProject('PRJ-D', ['開発部']);
    project.endDate = '2026-08-26';
    project.registeredAt = '2026-05-18';
    project.workStartDate = '2026-05-18';
    project.progressPercent = 60;
    const today = '2026-08-06';
    expect(countDelayedProjects([project], [], today)).toBe(1);
  });
});

function mkProject(mn: string, departments: string[]): ProjectRow {
  return {
    managementNumber: mn,
    name: mn,
    description: '',
    departments,
    endDate: '2026-06-01',
    priority: '中',
    registeredAt: '2026-05-01',
    workStartDate: '2026-05-01',
    completedAt: '',
    status: '着手中',
    progressPercent: 30,
    approver: '',
    participants: [],
    members: [],
    milestones: [],
    resourceFolders: [],
    relatedIssues: [],
    updateHistory: [],
    lastUpdatedAt: '',
    lastUpdatedBy: '',
  };
}
