import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Photo attribution line.
 *
 * CC BY images may only be reused with visible credit to the author, so this is
 * not decoration — for any restaurant or dish whose photo came from Commons, the
 * credit has to be on the page. It is intentionally quiet rather than hidden
 * behind a click: attribution that requires interaction does not satisfy the
 * licence.
 *
 * Renders nothing when there is no credit, which is the case for photos the
 * owner uploaded themselves.
 */
@Component({
  selector: 'app-image-credit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (credit(); as text) {
      <p class="credit">
        <span class="credit__icon" aria-hidden="true">©</span>
        <span class="credit__text">{{ text }}</span>
      </p>
    }
  `,
  styles: `
    .credit {
      display: flex;
      align-items: baseline;
      gap: var(--space-1);
      margin: var(--space-2) 0 0;
      font-size: 11px;
      line-height: 1.5;
      color: var(--color-text-muted);
      opacity: 0.85;
    }

    .credit__icon {
      flex-shrink: 0;
      font-size: 10px;
    }

    .credit__text {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  `,
})
export class ImageCreditComponent {
  /** e.g. `"Dish name — Photographer (CC BY 2.0)"`. */
  readonly credit = input<string | null>(null);
}