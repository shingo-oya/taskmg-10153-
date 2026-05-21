import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { FilterPresetsComponent } from '../shared/filter-presets/filter-presets.component';
import { ListFilterStateBridge } from '../../services/list-filter/list-filter-state.bridge';
import {
  readUsersFilterSnapshot,
  type UsersAppliedSignals,
} from '../../services/list-filter/list-filter-snapshot';
import type { FilterScreenId, FilterSnapshot } from '../../services/list-filter/list-filter.types';
import { PermissionService } from '../../services/permission/permission.service';
import { UsersService } from '../../services/users-service/users-service';
import type { UsersRow } from './users-row';

type UsersSortKey = 'department' | 'name' | 'email' | 'role' | 'status';

const FILTER_SCREEN: FilterScreenId = 'users';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [RouterLink, FilterPresetsComponent],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent {
  private readonly usersService = inject(UsersService);
  private readonly router = inject(Router);
  private readonly filterState = inject(ListFilterStateBridge);
  readonly perm = inject(PermissionService);

  constructor() {
    this.filterState.restoreUsers(FILTER_SCREEN, this.usersAppliedSignals());
    void this.usersService.ensureLoaded();
  }

  /** 一覧に反映されている条件 */
  readonly appliedDepartments = signal(new Set<string>());
  readonly appliedRoles = signal(new Set<string>());
  readonly appliedStatuses = signal(new Set<string>());

  /** パネル内で編集中（適用前） */
  readonly draftDepartments = signal(new Set<string>());
  readonly draftRoles = signal(new Set<string>());
  readonly draftStatuses = signal(new Set<string>());

  readonly panelOpen = signal(false);
  /** 検索パネル内で開いているプルダウン（同一時刻は1つ） */
  readonly openFilterDropdown = signal<'department' | 'role' | 'status' | null>(null);

  /** null のときはステータス降順→部署→名前（いずれも ja） */
  readonly activeSort = signal<{ key: UsersSortKey; dir: 'asc' | 'desc' } | null>(null);

  get departmentOptions(): string[] {
    return this.usersService.getDepartmentOptions();
  }

  get roleOptions(): string[] {
    const rows = this.usersService.getUsersRow();
    return [...new Set(rows.map((r) => r.role))].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  get statusOptions(): string[] {
    const rows = this.usersService.getUsersRow();
    return [...new Set(rows.map((r) => r.status))].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  get sortedFilteredUsers(): UsersRow[] {
    const rows = this.usersService.getUsersRow();
    const dept = this.appliedDepartments();
    const role = this.appliedRoles();
    const st = this.appliedStatuses();
    const filtered = rows.filter(
      (row) =>
        (dept.size === 0 || dept.has(row.department)) &&
        (role.size === 0 || role.has(row.role)) &&
        (st.size === 0 || st.has(row.status)),
    );
    const copy = [...filtered];
    const sort = this.activeSort();
    if (sort === null) {
      copy.sort((a, b) => this.defaultUserSortCompare(a, b));
    } else {
      copy.sort((a, b) => this.columnSortCompare(a, b, sort.key, sort.dir));
    }
    return copy;
  }

  /** ステータス逆順（あいうえお）→ 部署順 → 名前順 */
  private defaultUserSortCompare(a: UsersRow, b: UsersRow): number {
    const byStatus = b.status.localeCompare(a.status, 'ja');
    if (byStatus !== 0) {
      return byStatus;
    }
    const byDept = a.department.localeCompare(b.department, 'ja');
    if (byDept !== 0) {
      return byDept;
    }
    const byName = a.name.localeCompare(b.name, 'ja');
    if (byName !== 0) {
      return byName;
    }
    return a.email.localeCompare(b.email, 'ja');
  }

  private columnSortCompare(a: UsersRow, b: UsersRow, key: UsersSortKey, dir: 'asc' | 'desc'): number {
    const m = dir === 'asc' ? 1 : -1;
    const c = a[key].localeCompare(b[key], 'ja') * m;
    if (c !== 0) {
      return c;
    }
    return a.email.localeCompare(b.email, 'ja');
  }

  toggleSort(key: UsersSortKey): void {
    this.activeSort.update((cur) => {
      if (cur === null || cur.key !== key) {
        return { key, dir: 'asc' };
      }
      if (cur.dir === 'asc') {
        return { key, dir: 'desc' };
      }
      return null;
    });
  }

  ariaSortFor(key: UsersSortKey): 'ascending' | 'descending' | 'none' {
    const c = this.activeSort();
    if (!c || c.key !== key) {
      return 'none';
    }
    return c.dir === 'asc' ? 'ascending' : 'descending';
  }

  /** 画面上の［部署］表示用 */
  appliedDepartmentLabel(): string {
    return this.formatMultiSelectLabel(this.appliedDepartments());
  }

  /** 画面上の［権限］表示用 */
  appliedRoleLabel(): string {
    return this.formatMultiSelectLabel(this.appliedRoles());
  }

  /** 画面上の［ステータス］表示用 */
  appliedStatusLabel(): string {
    return this.formatMultiSelectLabel(this.appliedStatuses());
  }

  /** 複数選択の表示文言（未選択＝すべて） */
  formatMultiSelectLabel(s: ReadonlySet<string>): string {
    if (s.size === 0) {
      return 'すべて';
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ja')).join('、');
  }

  toggleSearchPanel(): void {
    if (this.panelOpen()) {
      this.panelOpen.set(false);
      this.openFilterDropdown.set(null);
      return;
    }
    this.draftDepartments.set(new Set(this.appliedDepartments()));
    this.draftRoles.set(new Set(this.appliedRoles()));
    this.draftStatuses.set(new Set(this.appliedStatuses()));
    this.openFilterDropdown.set(null);
    this.panelOpen.set(true);
  }

  closePanelWithoutApply(): void {
    this.panelOpen.set(false);
    this.openFilterDropdown.set(null);
  }

  applySearch(): void {
    this.appliedDepartments.set(new Set(this.draftDepartments()));
    this.appliedRoles.set(new Set(this.draftRoles()));
    this.appliedStatuses.set(new Set(this.draftStatuses()));
    this.openFilterDropdown.set(null);
    this.panelOpen.set(false);
    this.persistAppliedFilters();
  }

  draftFilterSnapshot(): FilterSnapshot {
    return readUsersFilterSnapshot(this.usersDraftSignals());
  }

  onPresetApplied(snapshot: FilterSnapshot): void {
    this.filterState.applyUsersPreset(FILTER_SCREEN, this.usersAppliedSignals(), snapshot);
    this.panelOpen.set(false);
    this.openFilterDropdown.set(null);
  }

  private usersAppliedSignals(): UsersAppliedSignals {
    return {
      departments: this.appliedDepartments,
      roles: this.appliedRoles,
      statuses: this.appliedStatuses,
    };
  }

  private usersDraftSignals(): UsersAppliedSignals {
    return {
      departments: this.draftDepartments,
      roles: this.draftRoles,
      statuses: this.draftStatuses,
    };
  }

  private persistAppliedFilters(): void {
    this.filterState.persistUsers(FILTER_SCREEN, this.usersAppliedSignals());
  }

  toggleFilterDropdown(which: 'department' | 'role' | 'status', event: MouseEvent): void {
    event.stopPropagation();
    this.openFilterDropdown.update((cur) => (cur === which ? null : which));
  }

  closeFilterDropdown(): void {
    this.openFilterDropdown.set(null);
  }

  onFilterPanelAreaClick(event: MouseEvent): void {
    const t = event.target as HTMLElement | null;
    if (t && !t.closest('.filter-dd')) {
      this.closeFilterDropdown();
    }
  }

  isDraftDepartmentSelected(value: string): boolean {
    return this.draftDepartments().has(value);
  }

  isDraftRoleSelected(value: string): boolean {
    return this.draftRoles().has(value);
  }

  isDraftStatusSelected(value: string): boolean {
    return this.draftStatuses().has(value);
  }

  onDraftDepartmentChange(value: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(this.draftDepartments());
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    this.draftDepartments.set(next);
  }

  onDraftRoleChange(value: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(this.draftRoles());
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    this.draftRoles.set(next);
  }

  onDraftStatusChange(value: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(this.draftStatuses());
    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    this.draftStatuses.set(next);
  }

  clearDraftFilters(): void {
    this.draftDepartments.set(new Set());
    this.draftRoles.set(new Set());
    this.draftStatuses.set(new Set());
    this.openFilterDropdown.set(null);
  }

  onEdit(user: UsersRow): void {
    void this.router.navigate(['/settings/users/edit', user.email]);
  }
}
