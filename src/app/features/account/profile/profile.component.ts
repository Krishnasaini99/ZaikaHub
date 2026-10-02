import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../core/utils/firebase-error.util';

/** Account profile: view details, update name/phone, sign out. */
@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly saving = signal(false);
  protected readonly user = this.auth.currentUser;
  protected readonly email = this.auth.email;
  protected readonly roleLabel = computed(() => this.auth.role());

  protected readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    phone: [''],
  });

  /**
   * Seeds the form from the loaded profile. Runs once the profile arrives,
   * which is why it is a `patchValue` and not an inline default value.
   */
  constructor() {
    effect(() => {
      const profile = this.user();
      if (profile) {
        this.form.patchValue({ displayName: profile.displayName, phone: profile.phone });
      }
    });
  }

  protected get invalid(): boolean {
    return this.form.invalid || this.form.touched;
  }

  protected async save(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const { displayName, phone } = this.form.getRawValue();
      await this.auth.updateProfile({ displayName, phone });
      this.toast.success('Profile updated.');
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not update your profile.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
