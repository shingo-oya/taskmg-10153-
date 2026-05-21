import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IssueTypeService } from '../../../services/issue-type/issue-type.service';
import type { IssueTypePreset } from '../../../services/issue-type/issue-type.types';

@Component({
  selector: 'app-settings-issue-types',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './settings-issue-types.component.html',
  styleUrl: './settings-issue-types.component.scss',
})
export class SettingsIssueTypesComponent {
  private readonly issueTypeService = inject(IssueTypeService);

  readonly newContent = signal('');
  readonly newFeedback = signal<null | 'added' | 'empty' | 'duplicate'>(null);

  readonly editingId = signal<string | null>(null);
  readonly editContent = signal('');
  readonly editFeedback = signal<null | 'empty' | 'duplicate' | 'notFound' | 'unchanged'>(null);
  readonly deleteConfirmId = signal<string | null>(null);

  presets(): IssueTypePreset[] {
    return this.issueTypeService.listAll();
  }

  onNewContentInput(event: Event): void {
    this.newContent.set((event.target as HTMLInputElement).value);
    this.newFeedback.set(null);
  }

  onAdd(): void {
    const result = this.issueTypeService.add(this.newContent());
    if (result.ok) {
      this.newContent.set('');
      this.newFeedback.set('added');
      return;
    }
    this.newFeedback.set(result.reason);
  }

  startEdit(preset: IssueTypePreset): void {
    this.editingId.set(preset.id);
    this.editContent.set(preset.content);
    this.editFeedback.set(null);
    this.deleteConfirmId.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editContent.set('');
    this.editFeedback.set(null);
    this.deleteConfirmId.set(null);
  }

  onEditContentInput(event: Event): void {
    this.editContent.set((event.target as HTMLInputElement).value);
    this.editFeedback.set(null);
    this.deleteConfirmId.set(null);
  }

  saveEdit(): void {
    const id = this.editingId();
    if (!id) {
      return;
    }
    this.deleteConfirmId.set(null);
    const result = this.issueTypeService.update(id, this.editContent());
    if (result.ok) {
      this.cancelEdit();
      return;
    }
    this.editFeedback.set(result.reason === 'notFound' ? 'notFound' : result.reason);
  }

  requestDelete(id: string): void {
    this.deleteConfirmId.set(id);
    this.editFeedback.set(null);
  }

  cancelDelete(): void {
    this.deleteConfirmId.set(null);
  }

  confirmDelete(): void {
    const id = this.deleteConfirmId();
    if (!id) {
      return;
    }
    const result = this.issueTypeService.delete(id);
    this.deleteConfirmId.set(null);
    if (result.ok) {
      if (this.editingId() === id) {
        this.cancelEdit();
      }
      return;
    }
    this.editFeedback.set('notFound');
  }

  presetLabel(preset: IssueTypePreset): string {
    return this.issueTypeService.presetLabel(preset);
  }
}
