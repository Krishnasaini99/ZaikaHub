import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { errorMessage } from '../../../core/utils/firebase-error.util';

/** Customer sign-up. Creates the auth account *and* its profile document. */
@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: '../auth-form.scss',
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group(
    {
      displayName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    // A form-level validator owns the cross-field "passwords match" rule, so
    // the logic lives in one testable place instead of the template.
    { validators: passwordsMatchValidator },
  );

  protected fieldInvalid(name: 'displayName' | 'email' | 'phone' | 'password' | 'confirmPassword'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected get passwordsMismatch(): boolean {
    return this.form.hasError('passwordMismatch');
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set(null);
    this.submitting.set(true);

    const { displayName, email, phone, password } = this.form.getRawValue();

    try {
      await this.auth.signUp({ email, password, displayName, phone });
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.error.set(errorMessage(error, 'Unable to create your account.'));
    } finally {
      this.submitting.set(false);
    }
  }
}

/** Cross-field validator: `confirmPassword` must equal `password`. */
export function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string | undefined;
  const confirm = group.get('confirmPassword')?.value as string | undefined;
  return password && confirm && password !== confirm ? { passwordMismatch: true } : null;
}

export const PHONE_VALIDATOR: ValidatorFn = Validators.pattern(/^[0-9]{10}$/);
