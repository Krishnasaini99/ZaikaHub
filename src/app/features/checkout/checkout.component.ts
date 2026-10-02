import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Address } from '../../core/models/address.model';
import { OrderAddress, PaymentMethod } from '../../core/models/order.model';
import { AddressService } from '../../core/services/address.service';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { OrderService } from '../../core/services/order.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/utils/firebase-error.util';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingComponent } from '../../shared/components/loading.component';
import { VegMarkerComponent } from '../../shared/components/veg-marker.component';

const PAYMENT_METHODS: readonly { value: PaymentMethod; label: string; note: string }[] = [
  { value: 'cod', label: 'Cash on delivery', note: 'Pay when your food arrives' },
  { value: 'upi', label: 'UPI', note: 'Pay by scanning the QR at delivery' },
  { value: 'card', label: 'Card', note: 'Card details are collected on delivery' },
];

/**
 * Checkout: pick a saved address (or add a new one), pick a payment method,
 * place the order.
 *
 * The order is written to Firestore by {@link OrderService} and the cart is
 * cleared only *after* that write succeeds — otherwise a failed write would
 * silently destroy the customer's cart.
 */
@Component({
  selector: 'app-checkout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    RouterLink,
    VegMarkerComponent,
    EmptyStateComponent,
  ],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
})
export class CheckoutComponent {
  private readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly orderService = inject(OrderService);
  private readonly addressService = inject(AddressService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly paymentMethods = PAYMENT_METHODS;
  protected readonly submitting = signal(false);
  protected readonly showAddressForm = signal(false);
  protected readonly savingAddress = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly uid = this.auth.uid();

  protected readonly addresses = toSignal(
    // The uid is non-null on this route (authGuard), but the service signature
    // demands a string — narrow defensively rather than casting blindly.
    this.addressService.listForUser(this.uid ?? ''),
    { initialValue: [] as readonly Address[] },
  );

  protected readonly selectedAddressId = signal<string | null>(null);
  protected readonly paymentMethod = signal<PaymentMethod>('cod');

  protected readonly items = computed(() => this.cart.cartItems());
  protected readonly totals = computed(() => this.cart.totals());
  protected readonly isEmpty = computed(() => this.cart.isEmpty());
  protected readonly restaurantName = computed(() => this.cart.restaurantName() ?? '');
  protected readonly restaurantId = computed(() => this.cart.restaurantId() ?? '');

  protected readonly addressForm = this.fb.nonNullable.group({
    label: ['Home', Validators.required],
    contactName: ['', Validators.required],
    contactPhone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    line1: ['', Validators.required],
    line2: [''],
    city: ['', Validators.required],
    pincode: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]],
  });

  constructor() {
    // Preselect the default (or first) address once the list arrives.
    effect(() => {
      const list = this.addresses();
      if (this.selectedAddressId() === null && list.length > 0) {
        this.selectedAddressId.set((list.find((a) => a.isDefault) ?? list[0]).id);
      }
    });
  }

  protected selectedAddress = computed<Address | null>(() => {
    const id = this.selectedAddressId();
    return this.addresses().find((address) => address.id === id) ?? null;
  });

  protected selectAddress(id: string): void {
    this.selectedAddressId.set(id);
  }

  protected setPaymentMethod(method: PaymentMethod): void {
    this.paymentMethod.set(method);
  }

  protected toggleAddressForm(): void {
    this.showAddressForm.update((visible) => !visible);
  }

  protected get addressFormInvalid(): boolean {
    return this.addressForm.invalid || this.addressForm.touched;
  }

  protected async saveAddress(): Promise<void> {
    if (this.addressForm.invalid || this.savingAddress()) {
      this.addressForm.markAllAsTouched();
      return;
    }

    this.savingAddress.set(true);
    try {
      const uid = this.uid;
      if (!uid) {
        return;
      }
      const id = await this.addressService.add(uid, this.addressForm.getRawValue());
      this.selectedAddressId.set(id);
      this.showAddressForm.set(false);
      this.addressForm.reset({ label: 'Home', line2: '' });
      this.toast.success('Address saved.');
    } catch (error) {
      this.toast.error(errorMessage(error, 'Could not save the address.'));
    } finally {
      this.savingAddress.set(false);
    }
  }

  protected async placeOrder(): Promise<void> {
    const uid = this.uid;
    const address = this.selectedAddress();
    const restaurantId = this.restaurantId();

    if (!uid || !address || !restaurantId || this.isEmpty()) {
      this.error.set('Select a delivery address to continue.');
      return;
    }
    if (this.submitting()) {
      return;
    }

    this.error.set(null);
    this.submitting.set(true);

    try {
      const orderId = await this.orderService.placeOrder({
        userId: uid,
        restaurantId,
        restaurantName: this.restaurantName(),
        restaurantCoverImageUrl: null,
        items: this.items(),
        address: toOrderAddress(address),
        paymentMethod: this.paymentMethod(),
      });

      // Only now is it safe to empty the cart.
      this.cart.clear();
      this.toast.success('Order placed successfully.');
      await this.router.navigate(['/orders'], { queryParams: { placed: orderId } });
    } catch (error) {
      this.error.set(errorMessage(error, 'Could not place your order. Please try again.'));
    } finally {
      this.submitting.set(false);
    }
  }
}

/** Strips the fields an order snapshot does not need. */
function toOrderAddress(address: Address): OrderAddress {
  return {
    label: address.label,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    pincode: address.pincode,
  };
}
