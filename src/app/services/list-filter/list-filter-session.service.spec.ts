import { TestBed } from '@angular/core/testing';

import { AuthService } from '../auth-service/auth.service';
import { ListFilterSessionService } from './list-filter-session.service';

describe('ListFilterSessionService', () => {
  let service: ListFilterSessionService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ListFilterSessionService);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('saves and loads project filter for a screen', () => {
    const snapshot = {
      kind: 'project' as const,
      departments: ['開発部'],
      members: [],
      endDateFrom: '',
      endDateTo: '',
      priorities: [],
      statuses: [],
    };
    service.save('project-list', snapshot);
    const loaded = service.load('project-list');
    expect(loaded).toEqual(snapshot);
  });
});
