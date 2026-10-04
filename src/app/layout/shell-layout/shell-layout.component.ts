import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { SiteContentService } from '../../core/services/site-content.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { DEFAULT_SITE_CONTENT } from '../../core/utils/site-content.util';
import { SignInPromptComponent } from '../../shared/components/sign-in-prompt.component';
import { ToastStackComponent } from '../../shared/components/toast-stack.component';

/**
 * App chrome: sticky header, the routed page, and the global toast stack.
 *
 * Deliberately a *layout* rather than part of every page: pages stay free of
 * header markup, and the header is never re-created on navigation.
 */
@Component({
  selector: 'app-shell-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastStackComponent, SignInPromptComponent],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
})
export class ShellLayoutComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
  protected readonly theme = inject(ThemeService);
  private readonly siteContent = inject(SiteContentService);
  private readonly toast = inject(ToastService);

  /**
   * Footer copy, owned from the admin area.
   *
   * Lives here rather than in the admin page because the footer renders on every
   * route — this is the one read that makes the edit feel instant without the
   * owner having to go back to the home page to check it.
   */
  protected readonly content = toSignal(this.siteContent.watch(), {
    initialValue: DEFAULT_SITE_CONTENT,
  });

  protected readonly searchTerm = signal('');
  protected readonly menuOpen = signal(false);

  protected readonly cartCount = computed(() => this.cart.totals().itemCount);
  protected readonly firstName = computed(() => this.auth.displayName().split(' ')[0] ?? '');

  /**
   * Zomato-style first-visit sign-in prompt.
   *
   * `sessionStorage` rather than a signal alone so it appears once per session
   * and does not re-open on every route change; the sign-in state is also
   * watched so signing in anywhere dismisses it immediately.
   */
  protected readonly showSignInPrompt = signal(false);

  private static readonly PROMPT_KEY = 'zaika-hub.signin-prompt-seen';

  constructor() {
    // Signing in from anywhere dismisses the prompt immediately. `effect()` needs
    // an injection context, so it lives in the constructor — calling it from
    // `ngOnInit` throws NG0203.
    effect(() => {
      if (this.auth.isLoggedIn()) {
        this.showSignInPrompt.set(false);
      }
    });
  }

  ngOnInit(): void {
    // `CartService` is injected above, which is what triggers its localStorage
    // restore + persistence effect as soon as the shell mounts.
    this.maybeShowSignInPrompt();
  }

  private maybeShowSignInPrompt(): void {
    if (this.auth.isLoggedIn() || sessionStorage.getItem(ShellLayoutComponent.PROMPT_KEY)) {
      return;
    }
    this.showSignInPrompt.set(true);
  }

  protected dismissSignInPrompt(): void {
    this.showSignInPrompt.set(false);
    try {
      sessionStorage.setItem(ShellLayoutComponent.PROMPT_KEY, '1');
    } catch {
      // Private mode can refuse storage; the prompt simply shows again next load.
    }
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected async signOut(): Promise<void> {
    this.closeMenu();
    await this.auth.signOut();
    this.toast.info('You have been signed out.');
  }
}
