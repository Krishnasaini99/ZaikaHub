# RFP — Most Sold Items

Branch: `feature/most-sold-item` · Date: 2026-10-03 · Status: **DRAFT — owner approval pending**

## 1. Objective

Show customers what actually sells — "Most Ordered" dishes — instead of only the
hand-picked `isBestseller` flag. Swiggy and Zomato both merchandise a
bestseller row; this is ZaikaHub's version of it.

## 2. What exists today

- `MenuItem.isBestseller` — a **manual** boolean set in the seed data. Nobody
  recomputes it; it says what the owner *claims* sells, not what sells.
- `highlightDishes` — a curated home-page strip, admin-written, 12 entries.
- `orders/{orderId}` — every order stores `restaurantId`, `status`, and
  `items[]` with `menuItemId`, `name`, `quantity`. This is the raw material a
  real "most sold" count can be built from.

## 3. Proposed scope (recommended)

**A. "Most Ordered" strip on the home page** — top 8–10 dishes by delivered
order quantity across all restaurants, each card linking to its restaurant.
Falls back to the existing `isBestseller` dishes when there are no delivered
orders yet (fresh install, new restaurant), so the section is never empty.

**B. "Bestseller" badge on restaurant detail pages** — the top 1–2 dishes of
*that* restaurant get a visible badge, computed from the same counts.

**C. Nothing manual to maintain** — counts recompute from `orders`, no new
dashboard, no per-dish admin editing.

## 4. Functional requirements

1. Only orders with `status` in (`accepted`, `preparing`, `out_for_delivery`,
   `delivered`) count. `placed` (not yet accepted) and `cancelled` never count.
2. Ranking is by total `quantity` summed per `menuItemId`, not by order count —
   3 biryanis in one order outrank 1 pizza in three orders.
3. Counts are scoped per restaurant for the badge (B) and global for the home
   strip (A).
4. A dish deleted from the menu disappears from the ranking; a renamed dish
   keeps its history only if `menuItemId` is unchanged (it is the key, never
   the name).
5. Fresh/empty data falls back to `isBestseller` dishes, clearly and without
   a loading skeleton stuck on screen.
6. The home strip reuses the existing dish-card component (same photo, price,
   veg mark, credit line) — no second card design.

## 5. Data approach (two options — owner picks one)

- **Option 1 — client-side aggregation (recommended for now).** The home page
  already reads public collections; a `dishStats` util sums quantities from the
  orders the client can see. Zero backend, zero cost, works on the free
  Spark plan. Limit: does not scale past a few thousand orders.
- **Option 2 — server counter.** A Cloud Function increments
  `dishStats/{menuItemId}` on each delivered order. Correct at any scale, but
  needs the Blaze plan (credit card) — rejected earlier for cost reasons.

Default: Option 1 now, with the counting logic isolated in a pure, tested
util so Option 2 can replace the source later without touching the UI.

## 6. Non-functional requirements

- Both themes: badges and strip pass WCAG AA (4.5:1) on light **and** dark —
  verified with the same contrast-audit probe used for the filters fix.
- Performance: no new blocking query on first paint; the strip renders from
  already-loaded data or appears after it, never delaying LCP.
- Tests: pure counting logic gets a `*.spec.ts` (empty orders, cancelled
  excluded, quantity-vs-order-count, tie order); `tsc` clean.
- Images: only existing licensed photos, with the same credit component.
- Rules: no `firestore.rules` change. Reads stay within what is already
  public; no write path is added.

## 7. Out of scope

- Time windows ("trending this week") — all-time counts only.
- Per-area / per-city ranking — global + per-restaurant only.
- Admin UI for overriding the ranking.
- Push/email "bestseller" merchandising.

## 8. Open questions for the owner

1. Home strip, restaurant badge, or both? (Recommendation: both — A + B.)
2. How many dishes in the strip — 8 or 10?
3. "Most Ordered" label, or "Bestsellers"? (Recommendation: "Most Ordered",
   because the number is real and the label should say so.)
4. Option 1 (client aggregation) acceptable, or is server counting wanted
   despite the Blaze cost?

## 9. Acceptance criteria

- [ ] Home shows the strip with the truly most-ordered dishes first
      (verified by placing test orders in the emulator and re-checking order).
- [ ] A restaurant detail page badges its own top dishes.
- [ ] With zero orders, the strip still shows sensible (flag-based) dishes.
- [ ] Contrast audit: 0 failures on both themes.
- [ ] `tsc` clean, all tests green, both verify scripts pass.
