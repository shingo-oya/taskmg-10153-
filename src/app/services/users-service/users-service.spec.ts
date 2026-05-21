import { TestBed } from '@angular/core/testing';

import { UsersFirestoreService } from '../users-firestore/users-firestore.service';
import { UsersService } from './users-service';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: UsersFirestoreService,
          useValue: {
            listAll: async () => [
              {
                uid: 'u1',
                profile: {
                  email: 'a@example.com',
                  displayName: '鈴木一郎',
                  department: '開発部',
                  role: 'メンバー',
                  status: '有効',
                },
              },
              {
                uid: 'u2',
                profile: {
                  email: 'b@example.com',
                  displayName: '山田太郎',
                  department: '営業部',
                  role: 'メンバー',
                  status: '有効',
                },
              },
            ],
            getProfileByUid: async () => null,
            findUidByEmail: async () => null,
            updateProfile: async () => undefined,
            createAuthUserWithProfile: async () => ({ ok: true as const, uid: 'new' }),
          },
        },
      ],
    });
    service = TestBed.inject(UsersService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getUserNamesByDepartment should return names for that department only', async () => {
    await service.ensureLoaded();
    const names = service.getUserNamesByDepartment('開発部');
    expect(names).toContain('鈴木一郎');
    expect(names).not.toContain('山田太郎');
  });
});
