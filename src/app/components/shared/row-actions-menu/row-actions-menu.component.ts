import {
  Component,
  ElementRef,
  HostListener,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgStyle } from '@angular/common';

export type RowActionId = 'edit' | 'archive' | 'trash';

export interface RowActionItem {
  id: RowActionId;
  label: string;
  danger?: boolean;
}

@Component({
  selector: 'app-row-actions-menu',
  standalone: true,
  imports: [NgStyle],
  templateUrl: './row-actions-menu.component.html',
  styleUrl: './row-actions-menu.component.scss',
})
export class RowActionsMenuComponent {
  readonly actions = input<RowActionItem[]>([
    { id: 'edit', label: '編集' },
    { id: 'archive', label: 'アーカイブ' },
    { id: 'trash', label: 'ゴミ箱へ', danger: true },
  ]);
  /** 一覧など表の overflow 内で切れないよう body 基準で固定配置する */
  readonly floatingMenu = input(false);
  readonly actionSelect = output<RowActionId>();

  private readonly triggerRef = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menuRef = viewChild<ElementRef<HTMLUListElement>>('menu');

  readonly open = signal(false);
  readonly menuFixedStyle = signal<Record<string, string>>({});

  toggle(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const willOpen = !this.open();
    this.open.set(willOpen);
    if (willOpen && this.floatingMenu()) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.updateFloatingPosition());
      });
    }
  }

  selectAction(id: RowActionId, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.close();
    this.actionSelect.emit(id);
  }

  close(): void {
    this.open.set(false);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.open()) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) {
      this.close();
    }
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    if (this.open() && this.floatingMenu()) {
      this.close();
    }
  }

  private updateFloatingPosition(): void {
    const trigger = this.triggerRef()?.nativeElement;
    const menu = this.menuRef()?.nativeElement;
    if (!trigger || !menu) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const menuWidth = menu.offsetWidth;
    const gap = 4;
    const margin = 8;

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - margin) {
      top = rect.top - menuHeight - gap;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - menuHeight - margin));

    let left = rect.right - menuWidth;
    left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));

    this.menuFixedStyle.set({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      right: 'auto',
      zIndex: '150',
    });
  }
}
