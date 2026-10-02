/** A saved delivery address belonging to a user. */
export interface Address {
  readonly id: string;
  readonly userId: string;
  readonly label: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly pincode: string;
  readonly isDefault: boolean;
  readonly createdAt: Date;
}
