import { Injectable } from '@angular/core';

import type { ProjectRow } from '../../components/project-list/project-row';
import type { TaskRow } from '../../components/task-list/task-row';
import { calculateDisplayedTaskProgress } from '../../shared/task-hierarchy';
import { downloadCsv, sanitizeFilenamePart } from '../../shared/csv-export';
import type { MemberLoadRow, OrgDashboardSnapshot, ProjectDashboardSnapshot } from './dashboard.types';

function sectionHeader(title: string): string[] {
  return [title];
}

function blankRow(): string[] {
  return [''];
}

function taskLine(task: TaskRow): string {
  return `${task.managementNo} · ${task.taskname}`;
}

function memberLoadPercentRows(rows: readonly MemberLoadRow[]): string[][] {
  const total = rows.reduce((sum, r) => sum + r.openTaskCount, 0);
  return rows.map((r) => {
    const percent = total > 0 ? Math.round((r.openTaskCount / total) * 100) : 0;
    return [r.memberName, String(r.openTaskCount), `${percent}%`];
  });
}

@Injectable({
  providedIn: 'root',
})
export class DashboardCsvExportService {
  exportProjectDashboard(
    snapshot: ProjectDashboardSnapshot,
    allTasks: readonly TaskRow[],
    isDelayed: boolean,
  ): void {
    const rows: string[][] = [];
    const p = snapshot.project;

    rows.push(sectionHeader('【サマリ】'));
    rows.push(['項目', '値']);
    rows.push(['プロジェクト名', p.name]);
    rows.push(['管理番号', p.managementNumber]);
    rows.push(['基準日', snapshot.today]);
    rows.push(['プロジェクト進捗率', `${snapshot.progressPercent}%`]);
    rows.push(['遅延', isDelayed ? '遅延' : '']);
    rows.push(['紐づく課題', `${snapshot.tasks.length} 件`]);
    rows.push(blankRow());

    rows.push(sectionHeader('【課題一覧（進捗率）】'));
    rows.push(['課題', 'ステータス', '進捗', '終了予定']);
    for (const t of snapshot.tasks) {
      rows.push([
        taskLine(t),
        t.status,
        `${calculateDisplayedTaskProgress(t, allTasks)}%`,
        t.endDate,
      ]);
    }
    rows.push(blankRow());

    rows.push(sectionHeader('【今日期限の課題】'));
    rows.push(['課題', 'ステータス', '進捗']);
    for (const t of snapshot.dueToday) {
      rows.push([taskLine(t), t.status, `${calculateDisplayedTaskProgress(t, allTasks)}%`]);
    }
    rows.push(blankRow());

    rows.push(sectionHeader('【期限切れの課題】'));
    rows.push(['課題', 'ステータス', '終了予定']);
    for (const t of snapshot.overdue) {
      rows.push([taskLine(t), t.status, t.endDate]);
    }
    rows.push(blankRow());

    rows.push(sectionHeader('【近日期限の課題（7日以内）】'));
    rows.push(['課題', '終了予定']);
    for (const t of snapshot.dueSoon) {
      rows.push([taskLine(t), t.endDate]);
    }
    rows.push(blankRow());

    rows.push(sectionHeader('【メンバー別負荷（未完了課題数）】'));
    rows.push(['メンバー', '件数']);
    for (const row of snapshot.memberLoad) {
      rows.push([row.memberName, String(row.openTaskCount)]);
    }

    const filename = `project-dashboard_${sanitizeFilenamePart(p.managementNumber)}_${snapshot.today}.csv`;
    downloadCsv(filename, rows);
  }

  exportOrgDashboard(
    snapshot: OrgDashboardSnapshot,
    projectProgress: (project: ProjectRow) => number,
    isProjectDelayedRow: (project: ProjectRow) => boolean,
    projectDepartments: (project: ProjectRow) => string,
  ): void {
    const rows: string[][] = [];
    const deptLabel = snapshot.filters.department || 'すべて';
    const pmnLabel = snapshot.filters.projectManagementNumber || 'すべて';

    rows.push(sectionHeader('【サマリ】'));
    rows.push(['項目', '値']);
    rows.push(['基準日', snapshot.today]);
    rows.push(['部署フィルタ', deptLabel]);
    rows.push(['プロジェクトフィルタ', pmnLabel]);
    rows.push(['対象プロジェクト', `${snapshot.projects.length} 件`]);
    rows.push(['遅延プロジェクト', `${snapshot.delayedCount}`]);
    rows.push(blankRow());

    rows.push(sectionHeader('【プロジェクト一覧】'));
    rows.push(['プロジェクト', '管理番号', '部署', '進捗', '終了予定', '遅延']);
    for (const p of snapshot.projects) {
      rows.push([
        p.name,
        p.managementNumber,
        projectDepartments(p),
        `${projectProgress(p)}%`,
        p.endDate,
        isProjectDelayedRow(p) ? '遅延' : '',
      ]);
    }
    rows.push(blankRow());

    rows.push(sectionHeader('【今日期限のプロジェクト】'));
    rows.push(['プロジェクト', '管理番号', '終了予定']);
    for (const p of snapshot.dueTodayProjects) {
      rows.push([p.name, p.managementNumber, p.endDate]);
    }
    rows.push(blankRow());

    rows.push(sectionHeader('【期限切れのプロジェクト】'));
    rows.push(['プロジェクト', '管理番号', '終了予定']);
    for (const p of snapshot.overdueProjects) {
      rows.push([p.name, p.managementNumber, p.endDate]);
    }
    rows.push(blankRow());

    rows.push(sectionHeader('【近日期限のプロジェクト（7日以内）】'));
    rows.push(['プロジェクト', '管理番号', '終了予定']);
    for (const p of snapshot.dueSoonProjects) {
      rows.push([p.name, p.managementNumber, p.endDate]);
    }
    rows.push(blankRow());

    rows.push(sectionHeader('【メンバー別負荷（未完了課題数）】'));
    rows.push(['メンバー', '件数', '割合']);
    rows.push(...memberLoadPercentRows(snapshot.memberLoad));

    const deptPart = snapshot.filters.department
      ? sanitizeFilenamePart(snapshot.filters.department)
      : 'all-dept';
    const filename = `org-dashboard_${snapshot.today}_${deptPart}.csv`;
    downloadCsv(filename, rows);
  }
}
