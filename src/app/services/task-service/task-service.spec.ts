import { TestBed } from '@angular/core/testing';

import type { TaskRow } from '../../components/task-list/task-row';
import {
  calculateDisplayedParentTaskProgress,
  tasksForParent,
} from '../../shared/task-hierarchy';
import { TasksFirestoreService } from '../tasks-firestore/tasks-firestore.service';
import { UsersService } from '../users-service/users-service';
import { TASK_SEED_ROWS_RAW } from './task-seed-data';
import { TaskService } from './task-service';

function withSeededHierarchyForTest(rows: TaskRow[]): TaskRow[] {
  const normalized = rows.map((r) => ({
    ...r,
    parentTaskManagementNo: r.parentTaskManagementNo ?? '',
  }));
  const parentIdx = normalized.findIndex((r) => r.managementNo === 'TK-2026-001');
  if (parentIdx >= 0) {
    const children = tasksForParent(normalized, 'TK-2026-001');
    if (children.length > 0) {
      normalized[parentIdx] = {
        ...normalized[parentIdx],
        progressPercent: calculateDisplayedParentTaskProgress(normalized[parentIdx], normalized),
      };
    }
  }
  return normalized;
}

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(async () => {
    const seeded = withSeededHierarchyForTest(TASK_SEED_ROWS_RAW);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: UsersService,
          useValue: {
            getDepartmentOptions: () => [],
            getUserNamesByDepartment: () => [],
            getDistinctUserNames: () => [],
            ensureLoaded: async () => undefined,
          },
        },
        {
          provide: TasksFirestoreService,
          useValue: {
            seedIfEmpty: async () => true,
            listAll: async () => seeded.map((r) => ({ ...r })),
            setTask: async () => undefined,
            deleteTask: async () => undefined,
            getById: async () => null,
          },
        },
      ],
    });
    service = TestBed.inject(TaskService);
    await service.ensureLoaded();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('generateChildManagementNumber assigns parent-S sequence', () => {
    expect(service.generateChildManagementNumber('TK-2026-001')).toBe('TK-2026-001-S3');
  });
});
