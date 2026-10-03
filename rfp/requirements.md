# RFP — Most Sold Items

Branch: `feature/most-sold-item` · Date: 2026-10-03 · Status: **FINAL — owner answered all questions, approved for implementation**

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

## 3. Decided scope (owner answers, 2026-10-03)

**Home page, under every restaurant card: that restaurant's top 3 most-sold
dishes.** No separate strip anywhere — the card carries its own proof.

Each of the 3 rows shows, left to right:

1. Dish photo (small thumbnail, existing licensed image + credit chain
   untouched — the credit already lives on the dish).
2. Dish name (click → restaurant detail page) and price.
3. The order count as an exact number — "127 ordered".
4. An **Add** button — adds only that dish to the cart (existing cart +
   toast pattern, no new behaviour invented).

Clicking the photo or the name opens the restaurant's detail page; only the
Add button touches the cart.

When a restaurant has no counted orders yet, the same 3 rows show its
`isBestseller`-flagged dishes instead, and the count's place shows a small
**"Bestseller"** tag. The section is never empty and never lies: a real
number where there is one, a flag label where there isn't.

## 4. Functional requirements

1. Only orders with `status` in (`accepted`, `preparing`, `out_for_delivery`,
   `delivered`) count. `placed` (not yet accepted) and `cancelled` never count.
2. Ranking is by total `quantity` summed per `menuItemId`, not by order count —
   3 biryanis in one order outrank 1 pizza in three orders.
3. Counts are scoped per restaurant: the rows under a card count only that
   restaurant's orders. Exactly 3 rows per card.
4. A dish deleted from the menu disappears from the ranking; a renamed dish
   keeps its history only if `menuItemId` is unchanged (it is the key, never
   the name).
5. Zero counted orders → the 3 rows show `isBestseller` dishes with a
   "Bestseller" tag instead of a number. Fewer than 3 flagged dishes →
   fill the rest with the restaurant's first menu items in `order` sequence,
   so the block keeps its shape.
6. Add button: adds exactly that dish (quantity 1) to the cart and stays on
   the page. Feedback mirrors the restaurant detail page exactly — silent add,
   toast only when the cart switches restaurants ("Started a new cart…").
7. Photo/name click: navigates to `/restaurant/{slug}`. It never touches
   the cart.
8. Count format is the exact number ("127 ordered"), never rounded to
   "100+".

## 5. Data approach (DECIDED: dishStats + owner auto-sync)

Client-side aggregation over `orders` was the original recommendation, but it
is impossible: `orders` restricts reads to the placing customer, the
fulfilling restaurant and admins, so a signed-out home-page visitor can read
nothing at all. The design below is what the owner approved instead.

- New **`dishStats/{restaurantId}_{menuItemId}`** collection: public read,
  holding only `{ restaurantId, menuItemId, quantity, orderCount, updatedAt }`.
  Name, price and photo stay on the menu item — never duplicated here.
- Writes: only the restaurant's own owner (`managesRestaurant` rule, same
  gate as the menu), computed from that owner's readable orders. No customer
  can inflate or deflate any number.
- Sync trigger: the owner panel runs `DishStatsService.syncRestaurant` for
  each owned restaurant on open, writing back only changed counters. Nobody
  maintains anything by hand.
- Counting logic (`aggregateSales`, `pickTopDishes`) stays pure and unit
  tested, so a future server-side counter can replace the source without
  touching the UI.
- Server-counter alternative (Cloud Function) stays rejected on Blaze cost.

## 6. Non-functional requirements

- Both themes: badges and strip pass WCAG AA (4.5:1) on light **and** dark —
  verified with the same contrast-audit probe used for the filters fix.
- Performance: no new blocking query on first paint; the strip renders from
  already-loaded data or appears after it, never delaying LCP.
- Tests: pure counting logic gets a `*.spec.ts` (empty orders, cancelled
  excluded, quantity-vs-order-count, tie order); `tsc` clean.
- Images: only existing licensed photos, with the same credit component.
- Rules: one addition — the `dishStats` collection (public read, owner-only
  write, admin-only delete). Nothing else in `firestore.rules` changed; no
  existing collection's access was widened. No write path for customers exists.

## 7. Out of scope

- Time windows ("trending this week") — all-time counts only.
- Per-area / per-city ranking — global + per-restaurant only.
- Admin UI for overriding the ranking.
- Push/email "bestseller" merchandising.

## 8. Owner answers (all decided 2026-10-03)

1. ~~Home strip, restaurant badge, or both?~~ → **Neither: top-3 rows under
   each home restaurant card**, no separate strip, no detail-page badge.
2. ~~How many dishes?~~ → **3 per card.**
3. ~~Row contents?~~ → **Photo + name + price + Add button.**
4. ~~Click behaviour?~~ → **Add = cart only; photo/name = restaurant page.**
5. ~~Count display?~~ → **Exact number ("127 ordered"); "Bestseller" tag on
   fallback rows.**
6. ~~Counting option?~~ → **Option 1 (client aggregation) with
   `isBestseller` fallback** — §5 default confirmed.

## 9. Acceptance criteria

- [ ] Every home restaurant card carries 3 item rows with photo, name, price,
      count-or-Bestseller-tag, and an Add button.
- [ ] Row order matches real delivered quantities (verified by placing test
      orders in the emulator and re-checking the order).
- [ ] Add puts exactly that dish in the cart + toast, and stays on the page.
- [ ] Photo/name click lands on that restaurant's detail page.
- [ ] With zero orders, the rows still show 3 sensible flagged dishes.
- [ ] Contrast audit: 0 failures on both themes.
- [ ] `tsc` clean, all tests green, both verify scripts pass.
