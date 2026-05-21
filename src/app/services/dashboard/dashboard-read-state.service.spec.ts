import { TestBed } from '@angular/core/testing';

import { AuthService } from '../auth-service/auth.service';
import { DashboardReadStateFirestoreService } from './dashboard-read-state-firestore.service';
import { DashboardReadStateService } from './dashboard-read-state.service';

describe('DashboardReadStateService', () => {
  let service: DashboardReadStateService;
  let firestore: jasmine.SpyObj<DashboardReadStateFirestoreService>;

  beforeEach(() => {
    sessionStorage.clear();
    firestore = jasmine.createSpyObj('DashboardReadStateFirestoreService', ['listForUser', 'setLastReadAt']);
    firestore.listForUser.and.resolveTo([]);
    firestore.setLastReadAt.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        { provide: DashboardReadStateFirestoreService, useValue: firestore },
        { provide: AuthService, useValue: { currentUser: () => null } },
      ],
    });
    service = TestBed.inject(DashboardReadStateService);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('marks updates after scope lastReadAt as unread', async () => {
    firestore.listForUser.and.resolveTo([
      { kind: 'task', scopeId: 'TK-1', lastReadAtIso: '2026-05-10T10:00:00.000Z' },
    ]);
    await service.ensureLoaded('user-a');
    expect(service.isUpdateRead('user-a', 'task', 'TK-1', '2026-05-09T09:00:00.000Z')).toBeTrue();
    expect(service.isUpdateRead('user-a', 'task', 'TK-1', '2026-05-10T11:00:00.000Z')).toBeFalse();
    expect(service.isUpdateRead('user-a', 'project', 'PJ-1', '2026-05-10T11:00:00.000Z')).toBeFalse();
  });

  it('markScopeReadThroughNow writes per scope', async () => {
    await service.ensureLoaded('user-a');
    await service.markScopeReadThroughNow('user-a', 'project', 'PJ-9', '2026-05-10T12:00:00.000Z');
    expect(firestore.setLastReadAt).toHaveBeenCalledWith(
      'user-a',
      'project',
      'PJ-9',
      '2026-05-10T12:00:00.000Z',
    );
    expect(service.isUpdateRead('user-a', 'project', 'PJ-9', '2026-05-10T11:00:00.000Z')).toBeTrue();
  });
});
