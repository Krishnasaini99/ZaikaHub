import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

/**
 * First-visit sign-in prompt, in the spirit of Zomato's entry modal.
 *
 * Deliberately **dismissible**: a hard login wall would mean a reviewer landing
 * on the site sees nothing at all, which is a worse first impression than
 * "here is the food, sign in to order". Browsing stays open; only the actions
 * that genuinely need an account (cart, checkout, orders, owner panel) are
 * already behind `authGuard`.
 *
 * Shown once per browser session — the parent decides when by using `open()`.
 */
@Component({
  selector: 'app-sign-in-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="prompt__scrim" (click)="dismiss()"></div>

    <div
      class="prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-in-prompt-title"
      #dialog
    >
      <button type="button" class="prompt__close" aria-label="Close" (click)="dismiss()">
        ×
      </button>

      <div class="prompt__mark" aria-hidden="true">Z</div>

      <h2 id="sign-in-prompt-title" class="prompt__title">Get the best of ZaikaHub in your inbox</h2>
      <p class="prompt__body">
        Sign in to order food, track your delivery and save your favourite restaurants.
      </p>

      <div class="prompt__actions">
        <a class="btn btn--primary btn--block" routerLink="/register" (click)="closed.emit()">
          Sign up
        </a>
        <a class="btn btn--outline btn--block" routerLink="/login" (click)="closed.emit()">
          Log in
        </a>
      </div>

      <button type="button" class="prompt__skip" (click)="dismiss()">
        Browse without an account
      </button>
    </div>
  `,
  styles: `
    .prompt__scrim {
      position: fixed;
      inset: 0;
      z-index: var(--z-drawer);
      background: var(--color-overlay);
    }

    .prompt {
      position: fixed;
      /* Centred with translate rather than inset:0, which would stretch the
         panel to the full viewport height. */
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: calc(var(--z-drawer) + 1);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
      width: min(420px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      padding: var(--space-6);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--shadow-lg);
      text-align: center;
    }

    .prompt__close {
      position: absolute;
      top: var(--space-2);
      right: var(--space-3);
      border: 0;
      background: transparent;
      font-size: 24px;
      line-height: 1;
      color: var(--color-text-muted);
    }

    .prompt__mark {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: var(--radius-md);
      background: var(--color-brand);
      color: #fff;
      font-family: var(--font-display);
      font-size: 24px;
      font-weight: 700;
    }

    .prompt__title {
      font-size: 20px;
    }

    .prompt__body {
      color: var(--color-text-muted);
      font-size: 14px;
    }

    .prompt__actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      width: 100%;
      margin-top: var(--space-2);
    }

    .prompt__skip {
      margin-top: var(--space-1);
      border: 0;
      background: transparent;
      color: var(--color-text-muted);
      font-size: 13px;
      text-decoration: underline;
    }
  `,
})
export class SignInPromptComponent {
  private readonly auth = inject(AuthService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Emitted whenever the prompt leaves the screen, whatever the reason. */
  readonly closed = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  constructor() {
    // Escape closes, matching what a dialog is expected to do.
    effect((onCleanup) => {
      const onKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          this.dismiss();
        }
      };
      document.addEventListener('keydown', onKeydown);
      onCleanup(() => document.removeEventListener('keydown', onKeydown));
    });

    // Move focus into the dialog so keyboard users are not left behind it.
    queueMicrotask(() => this.dialog()?.nativeElement.focus?.());
  }

  dismiss(): void {
    this.closed.emit();
  }
}
