# Payment and Commission Workflow

## Phase 1 behavior

- Customers choose Flutterwave or cash on the complete-payment page after entering their booking details.
- Online checkout continues through the existing Flutterwave verification flow. The configured platform commission rate is used for online pricing and provider settlement calculations.
- Cash customers pay the provider directly after the service. Cash checkout excludes the online platform fee; commission is calculated on the service subtotal (excluding travel fees) and is recorded as provider debt only after completion is confirmed.
- Cash commissions are due within 7 days after the provider confirms service completion with the customer's PIN in Provider Bookings. Providers receive an in-app due notice and an overdue reminder when their dashboard next loads after the deadline.
- New bookings through any payment method are blocked when a provider has overdue commission or their outstanding NGN commission reaches the configured limit, initially ₦10,000. Booking access returns after the relevant commission is settled and an admin confirms receipt.
- Providers must accept the current commission policy before publishing or editing a service or receiving new bookings. Acceptance records the provider, policy version, commission rate, NGN limit, and timestamp. Repeated non-payment may lead to service suspension or account termination under the provider agreement; debt recovery must follow lawful contractual processes.
- Supabase generates a six-digit completion PIN. Customers view it in My Bookings and give it to the provider after the service. Providers enter it in Provider Bookings; only the completion RPC can mark the booking complete. Five invalid attempts temporarily lock that booking's PIN. Customers can report a problem before sharing the PIN.
- Cash payments are recorded as successful in `payments` when completion is confirmed. No customer funds are held by Vorabukeen.
- Platform-held / escrow-style payments are not implemented.

The initial platform commission is set to 10% by the migration. Admins can update the rate in Platform Settings. Provider commissions and settlements retain their service currency rather than combining different currencies. The NGN provider commission limit defaults to ₦10,000 and is configurable in Platform Settings. The limit applies across all new booking methods when reached; commissions in other currencies are tracked separately and do not count toward the NGN threshold, but become booking-restricting if overdue.

## Commission settlement

1. A provider transfers the displayed outstanding amount in NGN to Vorabukeen's business account: Flutterwave MFB, account name Ifechukwu Atuegbu, account number 9562805066. Include the provider name or ID in the transfer narration.
2. The provider submits the transfer amount and bank reference from the Provider Dashboard.
3. An admin verifies the funds in the bank account, then selects **Confirm received** in Admin → Commissions.
4. The provider balance is reduced only after admin confirmation. Confirmed payments are allocated to the provider's oldest outstanding commission records.

Review pending bank references against the bank statement before confirming. The internal provider balance is an accounting record, not a stored-value wallet.

## Supabase deployment

Apply [`supabase/migrations/202611080001_provider_commissions.sql`](./supabase/migrations/202611080001_provider_commissions.sql), [`supabase/migrations/202611080002_provider_commission_enforcement.sql`](./supabase/migrations/202611080002_provider_commission_enforcement.sql), [`supabase/migrations/202611080003_numeric_settings_id.sql`](./supabase/migrations/202611080003_numeric_settings_id.sql), [`supabase/migrations/202611080004_reload_postgrest_schema.sql`](./supabase/migrations/202611080004_reload_postgrest_schema.sql), [`supabase/migrations/202611080005_remove_booking_completion_pin.sql`](./supabase/migrations/202611080005_remove_booking_completion_pin.sql), [`supabase/migrations/202611080006_remove_legacy_completion_pin_guard.sql`](./supabase/migrations/202611080006_remove_legacy_completion_pin_guard.sql), and [`supabase/migrations/202611080007_restore_booking_completion_pin.sql`](./supabase/migrations/202611080007_restore_booking_completion_pin.sql) in order before deploying the updated front end (for example, with `supabase db push` in the configured Supabase project). Migration 004 verifies required RPCs exist and reloads PostgREST's schema cache; migrations 005–006 remove the previous PIN flow; migration 007 restores customer PIN generation, the completion guard, the provider completion RPC, and the customer-only PIN lookup. The settings table uses a numeric ID; the lowest-ID row is treated as the platform settings row. The migrations add commission records, provider-policy acceptance records, access policies, settlement and reminder RPCs, and booking guards. The enforcement migration gives existing unpaid commissions a 7-day grace period from deployment. Verify that the Supabase project already has the application's `bookings`, `payments`, `payouts`, `services`, `settings`, `users`, and `notifications` tables before applying them.

The provider sees completed booking revenue by currency, cash-booking count, commission assessed, commission paid, outstanding balance, itemized due dates, overdue/limit restrictions, and payment history. Admins can review overall recorded commission, outstanding balances, identify providers by name, and confirm or reject submitted bank transfers.
