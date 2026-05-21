import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { UsersService } from '../../../services/users-service/users-service';

@Component({
  selector: 'app-users-departments',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './users-departments.component.html',
  styleUrl: './users-departments.component.scss',
})
export class UsersDepartmentsComponent {
  private readonly usersService = inject(UsersService);

  newDepartmentName = '';
  newFeedback: null | 'added' | 'empty' | 'duplicate' = null;

  editingOriginal: string | null = null;
  editDraft = '';
  editFeedback: null | 'empty' | 'duplicate' | 'notFound' | 'unchanged' | 'deleteInUse' | 'deleteNotFound' =
    null;
  /** 削除ボタン押下後の確認待ち */
  deleteConfirmVisible = false;

  /** あいうえお順（サービス側で localeCompare('ja') ソート済み） */
  departmentsSorted(): string[] {
    return this.usersService.getDepartmentOptions();
  }

  onNewDepartmentInput(event: Event): void {
    this.newDepartmentName = (event.target as HTMLInputElement).value;
    this.newFeedback = null;
  }

  onAddDepartment(): void {
    const result = this.usersService.addDepartment(this.newDepartmentName);
    if (result.ok) {
      this.newDepartmentName = '';
      this.newFeedback = 'added';
    } else {
      this.newFeedback = result.reason;
    }
  }

  startEdit(name: string): void {
    this.editingOriginal = name;
    this.editDraft = name;
    this.editFeedback = null;
    this.deleteConfirmVisible = false;
  }

  cancelEdit(): void {
    this.editingOriginal = null;
    this.editDraft = '';
    this.editFeedback = null;
    this.deleteConfirmVisible = false;
  }

  onDeleteClick(): void {
    this.deleteConfirmVisible = true;
    this.editFeedback = null;
  }

  cancelDeleteConfirm(): void {
    this.deleteConfirmVisible = false;
  }

  confirmDelete(): void {
    if (this.editingOriginal === null) {
      return;
    }
    const result = this.usersService.deleteDepartment(this.editingOriginal);
    this.deleteConfirmVisible = false;
    if (result.ok) {
      this.cancelEdit();
    } else if (result.reason === 'inUse') {
      this.editFeedback = 'deleteInUse';
    } else {
      this.editFeedback = 'deleteNotFound';
    }
  }

  onEditDraftInput(event: Event): void {
    this.editDraft = (event.target as HTMLInputElement).value;
    this.editFeedback = null;
    this.deleteConfirmVisible = false;
  }

  saveEdit(): void {
    if (this.editingOriginal === null) {
      return;
    }
    this.deleteConfirmVisible = false;
    const result = this.usersService.renameDepartment(this.editingOriginal, this.editDraft);
    if (result.ok) {
      this.cancelEdit();
    } else {
      this.editFeedback = result.reason;
    }
  }
}
