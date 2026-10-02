import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Generic spinner for lazy routes and in-flight queries. */
@Component({
  selector: 'app-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="loading" role="status" [attr.aria-busy]="true">
      <div class="loading__spinner" aria-hidden="true"></div>
      @if (showLabel()) {
        <p class="loading__label">{{ label() }}</p>
      }
      <span class="visually-hidden">{{ label() }}</span>
    </div>
  `,
  styles: `
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-6);
    }

    .loading__spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-brand);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .loading__label {
      color: var(--color-text-muted);
      font-size: 14px;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class LoadingComponent {
  readonly label = input<string>('Loading…');
  readonly showLabel = input(true);
}
