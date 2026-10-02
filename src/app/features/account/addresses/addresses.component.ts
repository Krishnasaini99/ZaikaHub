import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap, tap } from 'rxjs';

import { Address } from '../../../core/models/address.model';
import { AuthService } from '../../../core/services/auth.service';
import { AddressService } from '../../../core/services/address.service';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../core/utils/firebase-error.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading.component';

/** Saved delivery addresses: list, add, edit, delete, set default. */
@Component({
  selector: 'app-addresses',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, EmptyStateComponent, LoadingComponent],
  templateUrl: './addresses.component.html',
  styleUrl: './addresses.component.scss',
})
export class AddressesComponent {
  private readonly auth = inject(AuthService);
  private readonly addressService = inject(AddressService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  private readonly uid = toSignal(toObservable(this.auth.uid));

  /** See `owner-menu`: an empty list is loaded, not pending. */
  private readonly ready = signal(false);

  protected readonly addresses = toSignal(
    toObservable(this.uid).pipe(
      switchMap((uid) => this.addressService.listForUser(uid ?? '')),
      tap(() => this.ready.set(true)),
    ),
    { initialValue: [] as readonly Address[] },
  );

  /** `null` = list mode; otherwise the id of the address being edited. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    label: ['Home', Validators.required],
    contactName: ['', Validators.required],
    contactPhone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    line1: ['', Validators.required],
    line2: [''],
    city: ['', Validators.required],
    pincode: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]],
  });

  protected readonly loading = computed(() => !this.ready());
  protected readonly isFormVisible = computed(
    () => this.editingId() !== null || this.addresses().length === 0,
  );

  protected get editing(): boolean {
    return this.editingId() !== null;
  }

  protected get formInvalid(): boolean {
    return this.form.invalid || this.form.touched;
  }

  protected startAdd(): void {
    this.editingId.set('');
    this.form.reset({ label: 'Home', line2: '' });
  }

  protected startEdit(address: Address): void {
    this.editingId.set(address.id);
    this.form.setValue({
      label: address.label,
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      pincode: address.pincode,
    });
  }

  protected cancel(): void {
    this.editingId.set(null);
  }

  protected async save(): Promise<void> {
    const uid = this.uid();
    if (!uid || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      const id = this.editingId();

      if (id) {
        await this.addressService.update(uid, id, value);
        this.toast.success('Address updated.');
      } else {
        await this.addressService.add(uid, value);
        this.toast.success('Address added.');
      }
      this.editingId.set(null);
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not save the address.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(address: Address): Promise<void> {
    const uid = this.uid();
    if (!uid) {
      return;
    }
    try {
      await this.addressService.remove(uid, address.id);
      this.toast.info('Address removed.');
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not remove the address.'));
    }
  }

  protected async makeDefault(address: Address): Promise<void> {
    const uid = this.uid();
    if (!uid) {
      return;
    }
    try {
      await this.addressService.makeDefault(uid, address.id);
      this.toast.success(`${address.label} is now your default address.`);
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not update the default address.'));
    }
  }
}
