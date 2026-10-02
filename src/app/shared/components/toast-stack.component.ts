import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from '../../core/services/toast.service';

/**
 * Fixed-position stack of transient messages.
 *
 * Mounted once in the shell layout. `role="status"` + `aria-live="polite"`
 * means new toasts are announced without interrupting the user.
 */
@Component({
  selector: 'app-toast-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (toast of toasts.active(); track toast.id) {
        <div class="toast" [class]="'toast--' + toast.tone">
          <span>{{ toast.message }}</span>
          <button type="button" aria-label="Dismiss" (click)="toasts.dismiss(toast.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      bottom: var(--space-4);
      left: 50%;
      transform: translateX(-50%);
      z-index: var(--z-toast);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      width: min(420px, calc(100vw - 32px));
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: 0.7rem 0.9rem;
      border-radius: var(--radius-md);
      background: #1c1c1c;
      color: #fff;
      box-shadow: var(--shadow-lg);
      font-size: 14px;
      pointer-events: auto;
    }

    .toast span {
      flex: 1;
    }

    .toast button {
      border: 0;
      background: transparent;
      color: inherit;
      font-size: 18px;
      line-height: 1;
      opacity: 0.7;
    }

    .toast--success {
      background: var(--color-success);
    }

    .toast--error {
      background: var(--color-danger);
    }

    .toast--info {
      background: #2b2b2b;
    }
  `,
})
export class ToastStackComponent {
  protected readonly toasts = inject(ToastService);
}
