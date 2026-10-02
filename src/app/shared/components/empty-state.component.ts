import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Uniform empty / error state for lists and detail pages.
 *
 * Exposes an `emptyAction` slot so callers can pass a recovery action
 * ("Browse restaurants", "Retry") without this component knowing about routing.
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty" role="status">
      <div class="empty__icon" aria-hidden="true">{{ icon() }}</div>
      <h3 class="empty__title">{{ title() }}</h3>
      @if (message(); as messageText) {
        <p class="empty__message">{{ messageText }}</p>
      }
      <ng-content select="[emptyAction]" />
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-7) var(--space-4);
      text-align: center;
    }

    .empty__icon {
      font-size: 40px;
      line-height: 1;
    }

    .empty__title {
      font-size: 18px;
    }

    .empty__message {
      color: var(--color-text-muted);
      max-width: 44ch;
    }
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly message = input<string>('');
  readonly icon = input<string>('🍽️');
}
