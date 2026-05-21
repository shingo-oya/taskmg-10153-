import { TestBed } from '@angular/core/testing';

import { ProjectsFirestoreService } from '../projects-firestore/projects-firestore.service';
import { UsersService } from '../users-service/users-service';
import { PROJECT_SEED_ROWS } from './project-seed-data';
import { ProjectService } from './project-service';

describe('ProjectService', () => {
  let service: ProjectService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: UsersService,
          useValue: {
            getDepartmentOptions: () => ['開発部', '営業第一部'],
            getUserNamesByDepartment: () => [],
            getDistinctUserNames: () => [],
            ensureLoaded: async () => undefined,
          },
        },
        {
          provide: ProjectsFirestoreService,
          useValue: {
            seedIfEmpty: async () => true,
            listAll: async () => PROJECT_SEED_ROWS.map((r) => ({ ...r })),
            setProject: async () => undefined,
            deleteProject: async () => undefined,
            getById: async () => null,
          },
        },
      ],
    });
    service = TestBed.inject(ProjectService);
    await service.ensureLoaded();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return all rows when filters are empty', () => {
    const rows = service.getProjectRows();
    const filtered = service.filterProjects(rows, {
      departments: new Set(),
      members: new Set(),
      endDateFrom: '',
      endDateTo: '',
      priorities: new Set(),
      statuses: new Set(),
    });
    expect(filtered.length).toBe(rows.length);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('should filter by department set', () => {
    const rows = service.getProjectRows();
    const filtered = service.filterProjects(rows, {
      departments: new Set(['開発部']),
      members: new Set(),
      endDateFrom: '',
      endDateTo: '',
      priorities: new Set(),
      statuses: new Set(),
    });
    expect(filtered.every((r) => r.departments.includes('開発部'))).toBe(true);
  });

  it('should filter by end date range inclusive', () => {
    const rows = service.getProjectRows();
    const filtered = service.filterProjects(rows, {
      departments: new Set(),
      members: new Set(),
      endDateFrom: '2026-06-01',
      endDateTo: '2026-08-31',
      priorities: new Set(),
      statuses: new Set(),
    });
    expect(filtered.every((r) => r.endDate >= '2026-06-01' && r.endDate <= '2026-08-31')).toBe(true);
  });

  it('should match a row when any of its departments is selected', () => {
    const rows = service.getProjectRows();
    const multi = rows.find((r) => r.managementNumber === 'PRJ-2026-015');
    expect(multi?.departments.includes('開発部')).toBe(true);
    const filtered = service.filterProjects(rows, {
      departments: new Set(['開発部']),
      members: new Set(),
      endDateFrom: '',
      endDateTo: '',
      priorities: new Set(),
      statuses: new Set(),
    });
    expect(filtered.some((r) => r.managementNumber === 'PRJ-2026-015')).toBe(true);
  });

  it('should filter by member in members array', () => {
    const rows = service.getProjectRows();
    const filtered = service.filterProjects(rows, {
      departments: new Set(),
      members: new Set(['佐藤花子']),
      endDateFrom: '',
      endDateTo: '',
      priorities: new Set(),
      statuses: new Set(),
    });
    expect(filtered.every((r) => r.members.includes('佐藤花子'))).toBe(true);
  });
});
