import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { AdminMediaService } from '../../../core/services/admin-media.service';
import { SiteContentService } from '../../../core/services/site-content.service';
import { ToastService } from '../../../core/services/toast.service';
import type { CuisineTile, SiteContent } from '../../../core/models/site-content.model';
import { DEFAULT_SITE_CONTENT } from '../../../core/utils/site-content.util';
import { ImageCreditComponent } from '../../../shared/components/image-credit.component';

/**
 * Owner-only editor for everything on the public site that is not a restaurant:
 * page headings, footer lines, the promotional video and the cuisine tiles.
 *
 * Saves through `SiteContentService`, which re-merges the values before they are
 * written — so a form that is somehow empty saves the defaults rather than
 * blanking the live page.
 */
@Component({
  selector: 'app-admin-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ImageCreditComponent],
  templateUrl: './admin-content.component.html',
  styleUrl: '../admin.scss',
})
export class AdminContentComponent {
  private readonly content = inject(SiteContentService);
  private readonly media = inject(AdminMediaService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  /** Already a signal (`AuthService.uid` is a computed), so no `toSignal` here. */
  private readonly uid = this.auth.uid;

  protected readonly defaults = DEFAULT_SITE_CONTENT;
  protected readonly saving = signal(false);
  protected readonly uploading = signal<'hero' | 'promo' | null>(null);
  protected readonly live = toSignal(this.content.watch(), { initialValue: DEFAULT_SITE_CONTENT });

  protected readonly form = this.fb.nonNullable.group({
    heroTitle: ['', [Validators.required, Validators.maxLength(70)]],
    heroSubtitle: ['', Validators.maxLength(140)],
    heroSearchPlaceholder: ['', [Validators.required, Validators.maxLength(90)]],
    sectionDishesTitle: ['', Validators.maxLength(60)],
    sectionCuisineTitle: ['', Validators.maxLength(60)],
    sectionFeaturedTitle: ['', Validators.maxLength(60)],
    sectionFeaturedLinkText: ['', Validators.maxLength(40)],
    sectionDishesLinkText: ['', Validators.maxLength(40)],
    footerTagline: ['', Validators.maxLength(120)],
    footerNote: ['', Validators.maxLength(160)],
    promoTitle: ['', Validators.maxLength(60)],
    promoBody: ['', Validators.maxLength(200)],
  });

  protected readonly videoForm = this.fb.nonNullable.group({
    heroVideoEnabled: [false],
    promoVideoEnabled: [false],
  });

  constructor() {
    effect(() => {
      const content = this.live();
      this.form.patchValue(
        {
          heroTitle: content.heroTitle,
          heroSubtitle: content.heroSubtitle,
          heroSearchPlaceholder: content.heroSearchPlaceholder,
          sectionDishesTitle: content.sectionDishesTitle,
          sectionCuisineTitle: content.sectionCuisineTitle,
          sectionFeaturedTitle: content.sectionFeaturedTitle,
          sectionFeaturedLinkText: content.sectionFeaturedLinkText,
          sectionDishesLinkText: content.sectionDishesLinkText,
          footerTagline: content.footerTagline,
          footerNote: content.footerNote,
          promoTitle: content.promoTitle,
          promoBody: content.promoBody,
        },
        { emitEvent: false },
      );
      this.videoForm.patchValue(
        {
          heroVideoEnabled: content.heroVideoEnabled,
          promoVideoEnabled: content.promoVideoEnabled,
        },
        { emitEvent: false },
      );
    });
  }

  /** True until the owner has saved anything — used to show an honest hint. */
  protected readonly untouched = computed(
    () => this.live().updatedAt.getTime() === DEFAULT_SITE_CONTENT.updatedAt.getTime(),
  );

  protected async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      const video = this.videoForm.getRawValue();
      const merged = this.mergeWithMedia(value, video);
      await this.content.saveContent(merged);
      this.toast.success('Site content saved. The home page updates immediately.');
    } catch (error) {
      this.toast.error('Could not save the content.');
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Uploads a clip and turns the matching slot on in the same save.
   *
   * The toggle is set automatically rather than left for a second action: a
   * video the owner just uploaded but did not enable is the most likely
   * "why isn't it showing" confusion there is.
   */
  protected async onVideoSelected(slot: 'hero' | 'promo', event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    const uid = this.uid();
    if (!file || !uid) {
      return;
    }
    this.uploading.set(slot);
    try {
      const url = await this.media.uploadVideo(uid, file);
      const current = this.live();
      await this.content.saveContent({
        ...current,
        ...this.form.getRawValue(),
        heroVideoUrl: slot === 'hero' ? url : current.heroVideoUrl,
        heroVideoEnabled: slot === 'hero' ? true : current.heroVideoEnabled,
        promoVideoUrl: slot === 'promo' ? url : current.promoVideoUrl,
        promoVideoEnabled: slot === 'promo' ? true : current.promoVideoEnabled,
      });
      this.toast.success(
        slot === 'hero' ? 'Hero video uploaded and switched on.' : 'Promo video uploaded and switched on.',
      );
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      this.uploading.set(null);
      (event.target as HTMLInputElement).value = '';
    }
  }

  protected clearVideo(slot: 'hero' | 'promo'): void {
    void (async () => {
      const current = this.live();
      await this.content.saveContent({
        ...current,
        ...this.form.getRawValue(),
        heroVideoUrl: slot === 'hero' ? null : current.heroVideoUrl,
        heroVideoEnabled: slot === 'hero' ? false : current.heroVideoEnabled,
        promoVideoUrl: slot === 'promo' ? null : current.promoVideoUrl,
        promoVideoEnabled: slot === 'promo' ? false : current.promoVideoEnabled,
      });
      this.toast.info('Video removed.');
    })();
  }

  private mergeWithMedia(
    value: ReturnType<typeof this.form.getRawValue>,
    video: ReturnType<typeof this.videoForm.getRawValue>,
  ): SiteContent {
    const current = this.live();
    return {
      ...current,
      ...value,
      heroVideoEnabled: current.heroVideoUrl ? video.heroVideoEnabled : false,
      promoVideoEnabled: current.promoVideoUrl ? video.promoVideoEnabled : false,
    };
  }

  // ------------------------------------------------------------------ tiles

  protected readonly tiles = toSignal(this.content.watchCuisineTiles(), {
    initialValue: [] as readonly CuisineTile[],
  });
  protected readonly tileBusy = signal<string | null>(null);

  protected async onTileImage(id: string, event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    const uid = this.uid();
    if (!file || !uid) {
      return;
    }
    this.tileBusy.set(id);
    try {
      const tile = this.tiles().find((t) => t.id === id);
      const imageUrl = await this.media.uploadImage(uid, file);
      const base: CuisineTile = tile ?? {
        id,
        name: 'New cuisine',
        emoji: '🍽️',
        imageUrl: null,
        imageCredit: null,
        filter: '',
        order: this.tiles().length,
        updatedAt: new Date(),
      };
      await this.content.saveCuisineTile({ ...base, imageUrl });
      this.toast.success('Tile photo updated.');
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      this.tileBusy.set(null);
      (event.target as HTMLInputElement).value = '';
    }
  }

  protected async renameTile(tile: CuisineTile, name: string): Promise<void> {
    await this.content.saveCuisineTile({ ...tile, name, filter: tile.filter || name });
    this.toast.success('Tile renamed.');
  }

  protected async removeTilePhoto(tile: CuisineTile): Promise<void> {
    await this.content.saveCuisineTile({ ...tile, imageUrl: null, imageCredit: null });
    this.toast.info('Photo removed — the tile falls back to its emoji.');
  }
}