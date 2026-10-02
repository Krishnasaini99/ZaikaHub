import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The small green/red square marking a dish as veg or non-veg.
 *
 * `role="img"` with an `aria-label` because the colour alone carries meaning —
 * screen readers and colour-blind users get the same information.
 */
@Component({
  selector: 'app-veg-marker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="veg-dot"
      [class.veg-dot--veg]="isVeg()"
      [class.veg-dot--nonveg]="!isVeg()"
      role="img"
      [attr.aria-label]="isVeg() ? 'Veg' : 'Non-veg'"
      [title]="isVeg() ? 'Veg' : 'Non-veg'"
    ></span>
  `,
  styles: '',
})
export class VegMarkerComponent {
  readonly isVeg = input.required<boolean>();
}
