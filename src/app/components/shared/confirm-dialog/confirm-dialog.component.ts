import { Component, HostListener, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  readonly open = input(false);
  readonly message = input('');
  readonly confirmLabel = input('実行する');
  readonly cancelLabel = input('やめる');
  readonly danger = input(false);
  readonly ariaLabel = input('操作の確認');

  readonly confirm = output<void>();
  readonly cancel = output<void>();

  onBackdropClick(): void {
    this.cancel.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) {
      this.cancel.emit();
    }
  }
}
