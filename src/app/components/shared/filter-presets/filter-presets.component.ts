import { Component, HostListener, inject, input, output, signal } from '@angular/core';

import { ListFilterPresetService } from '../../../services/list-filter/list-filter-preset.service';
import type { FilterScreenId, FilterSnapshot } from '../../../services/list-filter/list-filter.types';

@Component({
  selector: 'app-filter-presets',
  standalone: true,
  templateUrl: './filter-presets.component.html',
  styleUrl: './filter-presets.component.scss',
})
export class FilterPresetsComponent {
  private readonly presetService = inject(ListFilterPresetService);

  readonly screen = input.required<FilterScreenId>();
  /** 検索パネル内で選択中（未適用）の条件を保存する */
  readonly draftSnapshot = input.required<FilterSnapshot>();
  readonly applySnapshot = output<FilterSnapshot>();

  readonly saveName = signal('');
  readonly saveOpen = signal(false);
  readonly listOpen = signal(false);
  readonly feedback = signal<string | null>(null);

  presetsForScreen() {
    this.presetService.presetsRevision();
    return this.presetService.listForScreen(this.screen());
  }

  toggleList(): void {
    this.listOpen.update((v) => !v);
    this.feedback.set(null);
  }

  closeList(): void {
    this.listOpen.set(false);
  }

  toggleSaveForm(): void {
    this.saveOpen.update((v) => !v);
    this.feedback.set(null);
    if (!this.saveOpen()) {
      this.saveName.set('');
    }
  }

  onSaveNameInput(event: Event): void {
    this.saveName.set((event.target as HTMLInputElement).value);
    this.feedback.set(null);
  }

  saveCurrent(): void {
    const name = this.saveName().trim();
    if (!name) {
      this.feedback.set('名前を入力してください。');
      return;
    }
    const created = this.presetService.savePreset(this.screen(), name, this.draftSnapshot());
    if (!created) {
      this.feedback.set('保存できませんでした。');
      return;
    }
    this.saveName.set('');
    this.saveOpen.set(false);
    this.feedback.set(`「${created.name}」を保存しました。`);
  }

  applyPreset(id: string): void {
    const preset = this.presetService.getPreset(id);
    if (!preset) {
      return;
    }
    this.applySnapshot.emit(preset.snapshot);
    this.closeList();
    this.feedback.set(`「${preset.name}」を適用しました。`);
  }

  deletePreset(id: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const preset = this.presetService.getPreset(id);
    if (!preset) {
      return;
    }
    if (this.presetService.deletePreset(id)) {
      this.feedback.set(`「${preset.name}」を削除しました。`);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.listOpen()) {
      this.closeList();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.listOpen()) {
      this.closeList();
    }
  }
}
