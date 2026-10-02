import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
}

const AUTO_DISMISS_MS = 4000;

/**
 * Transient feedback channel.
 *
 * Deliberately a signal + list rather than a DI-per-call toast service: the UI
 * only needs the latest few messages, and a signal avoids injecting a service
 * into every component that wants to say "added to cart".
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toasts = signal<readonly Toast[]>([]);
  private nextId = 0;

  readonly active = this.toasts.asReadonly();

  success(message: string): void {
    this.push(message, 'success');
  }

  error(message: string): void {
    this.push(message, 'error');
  }

  info(message: string): void {
    this.push(message, 'info');
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  private push(message: string, tone: ToastTone): void {
    const toast: Toast = { id: ++this.nextId, message, tone };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), AUTO_DISMISS_MS);
  }
}
