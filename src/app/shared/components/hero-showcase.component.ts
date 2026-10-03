import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import type { HighlightDish } from '../../core/models/restaurant.model';
import { advance, shouldRotate, show, toSlides } from '../../core/utils/hero-showcase.util';
import { ImageCreditComponent } from './image-credit.component';
import { VegMarkerComponent } from './veg-marker.component';

/**
 * How long each dish stays on screen before the next crossfade.
 *
 * 7s rather than 5s: at 5s the banner felt like it was rushing, and with the
 * twelfth dish added the loop had grown long enough that a slower step still
 * reads as unhurried rather than as a slideshow stuck in place. With twelve
 * slides this makes a full cycle 84 seconds.
 *
 * `tools/verify-hero-loop.mjs` reads this constant out of the file rather than
 * repeating it, so changing it here does not silently break the check.
 */
const ROTATE_MS = 7_000;

/** Duration of the crossfade itself. Must match the CSS transition. */
const FADE_MS = 900;

/**
 * The rotating food banner at the top of the home page.
 *
 * WHY THIS IS NOT A `<video>` ELEMENT
 * ----------------------------------
 * A video was the original brief, and it is worth being explicit about why this
 * is not one:
 *
 *  - There is no suitable openly-licensed source. Wikimedia Commons has food
 *    videos, but they are documentation clips, not a menu montage.
 *  - An autoplaying video at the top of the page is downloaded before anything
 *    else renders. That directly attacks LCP — the metric Google uses to rank
 *    pages, and the one thing the rest of this work optimises for.
 *  - On a phone that is several megabytes of the customer's data allowance
 *    before they have decided to order anything.
 *
 * A crossfade over images that are already on the CDN delivers the same effect —
 * dishes arriving one at a time, looping — for zero extra bytes, and the first
 * frame is an image the browser has already been told to expect.
 *
 * If a real video is wanted later, it is a one-component change: swap this for
 * `<video autoplay muted loop playsinline poster="...">`. Nothing else depends on
 * how the banner is drawn.
 *
 * Behaviour worth knowing:
 *  - Only the *visible* slide is kept in the DOM at full opacity, but all
 *    slides are rendered so the crossfade has something to fade between.
 *  - Rotation pauses when the tab is hidden or the banner scrolls out of view.
 *    A hidden timer that keeps firing is a flat battery cost for something
 *    nobody is looking at.
 *  - `prefers-reduced-motion` disables rotation entirely. The global stylesheet
 *    kills CSS transitions too, so the banner settles on a single dish.
 */
@Component({
  selector: 'app-hero-showcase',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, RouterLink, VegMarkerComponent, ImageCreditComponent],
  template: `
    @if (slides().length > 0) {
      <div class="showcase" [style.--fade-ms.ms]="FADE_MS">
        @for (dish of slides(); track dish.id; let i = $index) {
          <a
            class="slide"
            [class.slide--visible]="i === activeIndex()"
            [routerLink]="['/restaurant', dish.restaurantId]"
            [attr.aria-hidden]="i === activeIndex() ? null : 'true'"
            [attr.tabindex]="i === activeIndex() ? null : -1"
          >
            <img
              class="slide__image"
              [src]="dish.imageUrl"
              [alt]="dish.name + ' at ' + dish.restaurantName"
              [attr.loading]="i === 0 ? 'eager' : 'lazy'"
              [attr.fetchpriority]="i === 0 ? 'high' : 'auto'"
              decoding="async"
              width="640"
              height="360"
            />
            <span class="slide__scrim" aria-hidden="true"></span>

            <span class="slide__caption">
              <span class="slide__restaurant">{{ dish.restaurantName }}</span>
              <span class="slide__name">{{ dish.name }}</span>
              <span class="slide__price">{{ dish.price | currency: 'INR' }}</span>
              <span class="slide__meta">
                <app-veg-marker [isVeg]="dish.isVeg" />
                <app-image-credit [credit]="dish.imageCredit" />
              </span>
            </span>
          </a>
        }
      </div>

      <div class="dots" role="tablist" aria-label="Featured dishes">
        @for (dish of slides(); track dish.id; let i = $index) {
          <button
            type="button"
            class="dots__dot"
            [class.dots__dot--active]="i === activeIndex()"
            [attr.aria-label]="'Show ' + dish.name"
            [attr.aria-selected]="i === activeIndex()"
            role="tab"
            (click)="show(i, true)"
          ></button>
        }
      </div>
    }
  `,
  styles: `
    .showcase {
      position: relative;
      aspect-ratio: 16 / 9;
      border-radius: var(--radius-lg);
      overflow: hidden;
      background: var(--color-surface-alt);
      box-shadow: var(--shadow-lg);
    }

    .slide {
      position: absolute;
      inset: 0;
      display: block;
      opacity: 0;
      /* Fade only; sliding would look like a carousel rather than a menu montage. */
      transition: opacity var(--fade-ms) ease-in-out;
    }

    .slide--visible {
      opacity: 1;
    }

    .slide__image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /*
     * Gradient rather than a flat scrim: a flat overlay darkens the food, which
     * is the one thing the banner is showing. Darkening only the lower third
     * keeps the dish readable and the caption legible.
     */
    .slide__scrim {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to top,
        rgb(0 0 0 / 0.82) 0%,
        rgb(0 0 0 / 0.45) 32%,
        rgb(0 0 0 / 0) 60%
      );
    }

    .slide__caption {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      padding: var(--space-5);
      color: #fff;
    }

    .slide__restaurant {
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      opacity: 0.85;
    }

    .slide__name {
      font-family: var(--font-display);
      font-size: clamp(18px, 2.6vw, 26px);
      font-weight: 600;
      line-height: 1.2;
    }

    .slide__price {
      margin-top: 0.15rem;
      font-size: 15px;
      font-weight: 600;
    }

    .slide__meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }

    .dots {
      display: flex;
      justify-content: center;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    .dots__dot {
      width: 8px;
      height: 8px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: var(--color-border-strong);
      transition:
        background var(--fade-ms) ease,
        transform 150ms ease;

      &:hover {
        background: var(--color-text-muted);
      }
    }

    .dots__dot--active {
      background: var(--color-brand);
      transform: scale(1.35);
    }

    /*
     * On a phone the banner is short enough that a 16:9 crop of a landscape food
     * photo wastes the little height there is. A wider crop and a smaller caption
     * give the dish more of the screen.
     */
    @media (max-width: 640px) {
      .showcase {
        aspect-ratio: 4 / 3;
      }

      .slide__caption {
        padding: var(--space-4);
      }
    }

    /*
     * Rotation is already disabled in the component for these users; this stops
     * the crossfade itself from animating, so a change lands instantly instead
     * of lingering half-faded.
     */
    @media (prefers-reduced-motion: reduce) {
      .slide {
        transition: none;
      }
    }
  `,
})
export class HeroShowcaseComponent {
  /** Dishes to rotate through. Empty renders nothing at all. */
  readonly dishes = input.required<readonly HighlightDish[]>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly FADE_MS = FADE_MS;
  protected readonly activeIndex = signal(0);

  /** Only dishes that actually have a photo can be a slide. */
  protected readonly slides = computed(() => toSlides(this.dishes()));

  private timer: ReturnType<typeof setInterval> | null = null;
  private onScreen = true;
  private tabVisible = true;
  /** Set while the user is on reduced-motion, where rotation never runs. */
  private reducedMotion = false;

  constructor() {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Only start the clock once the component is on screen; starting in the
    // constructor would start it while the chunk was still being fetched.
    afterNextRender(() => {
      this.observeVisibility();
      this.observeTab();
      this.syncTimer();
    });

    // Stop the interval whenever the element goes away.
    this.destroyRef.onDestroy(() => this.stopTimer());

    // Restart the clock when the set of slides changes, so a fresh load does
    // not leave a stale interval pointing at an old length.
    effect(() => {
      this.slides();
      this.syncTimer();
    });
  }

  /**
   * Jumps to a slide. Called by the dots, which also stop the auto-rotation for
   * a while — a user who clicks a dot has expressed intent, and having the
   * banner move on from under them a second later feels like it ignored them.
   */
  protected show(index: number, manual = false): void {
    const target = show(index, this.slides().length);
    if (target === null) {
      return;
    }
    this.activeIndex.set(target);

    if (manual) {
      this.restartAfterManualPick();
    }
  }

  private manualPickUntil = 0;

  private restartAfterManualPick(): void {
    this.manualPickUntil = Date.now() + ROTATE_MS * 2;
    this.syncTimer();
  }

  private syncTimer(): void {
    const shouldRun =
      !this.reducedMotion &&
      shouldRotate(this.slides().length) &&
      this.onScreen &&
      this.tabVisible &&
      Date.now() >= this.manualPickUntil;

    if (shouldRun) {
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }

  private startTimer(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => this.advance(), ROTATE_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private advance(): void {
    const total = this.slides().length;
    if (total === 0) {
      return;
    }
    this.activeIndex.update((index) => advance(index, total));
  }

  /** Pauses when the banner scrolls out of view. */
  private observeVisibility(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        this.onScreen = entries.some((entry) => entry.isIntersecting);
        this.syncTimer();
      },
      { threshold: 0.2 },
    );
    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /** Pauses when the user is in another tab. */
  private observeTab(): void {
    const onVisibilityChange = () => {
      this.tabVisible = document.visibilityState === 'visible';
      this.syncTimer();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisibilityChange));
  }
}