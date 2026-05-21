import { TestBed } from '@angular/core/testing';

import { TrashService } from './trash.service';

describe('TrashService', () => {
  let service: TrashService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TrashService);
  });

  it('reserves project and task numbers after purge from trash bucket', () => {
    service.storeProject('trash', {
      deletedBy: 'テスト',
      project: { managementNumber: 'PRJ-TEST-001' } as never,
      linkedTasks: [{ managementNo: 'TK-TEST-001' } as never],
      projectChatMessages: [],
      taskChatMessagesByTaskNo: {},
    });
    const entry = service.removeProjectEntry('trash', 'PRJ-TEST-001');
    expect(entry).toBeTruthy();
    service.reserveProjectBundle(entry!);
    expect(service.isProjectNumberUsed('PRJ-TEST-001')).toBe(true);
    expect(service.isTaskNumberUsed('TK-TEST-001')).toBe(true);
    expect(service.getProjects('trash').length).toBe(0);
  });

  it('keeps archive and trash buckets separate', () => {
    service.storeTask('archive', {
      deletedBy: 'a',
      task: { managementNo: 'TK-ARC-001' } as never,
      chatMessages: [],
    });
    service.storeTask('trash', {
      deletedBy: 'b',
      task: { managementNo: 'TK-TRASH-001' } as never,
      chatMessages: [],
    });
    expect(service.getTasks('archive').length).toBe(1);
    expect(service.getTasks('trash').length).toBe(1);
    expect(service.getTasks('archive')[0]?.task.managementNo).toBe('TK-ARC-001');
  });
});
