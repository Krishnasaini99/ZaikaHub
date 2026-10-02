import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Catch-all for unknown URLs. */
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="notfound container">
      <p class="notfound__code" aria-hidden="true">404</p>
      <h1>We couldn't find that page</h1>
      <p class="muted">The link may be broken, or the page may have moved.</p>
      <a class="btn btn--primary" routerLink="/">Back to home</a>
    </div>
  `,
  styles: `
    .notfound {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
      padding-block: var(--space-8);
      text-align: center;
    }

    .notfound__code {
      font-size: 64px;
      font-weight: 800;
      color: var(--color-brand);
      line-height: 1;
    }
  `,
})
export class NotFoundComponent {}
