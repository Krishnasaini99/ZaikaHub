import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { errorMessage } from '../../../core/utils/firebase-error.util';

/**
 * Password reset request.
 *
 * Firebase's `sendPasswordResetEmail` deliberately does not reveal whether an
 * account exists, so the success copy is intentionally neutral — that is
 * correct behaviour, not a bug.
 */
@Component({
  selector: 'app-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: '../auth-form.scss',
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected get fieldInvalid(): boolean {
    const control = this.form.controls['email'];
    return control.invalid && (control.touched || control.dirty);
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set(null);
    this.submitting.set(true);

    try {
      await this.auth.sendResetEmail(this.form.getRawValue().email);
      this.sent.set(true);
    } catch (error) {
      this.error.set(errorMessage(error, 'Unable to send the reset email.'));
    } finally {
      this.submitting.set(false);
    }
  }
}
