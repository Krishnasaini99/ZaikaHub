# ZaikaHub — Zomato clone

Angular 20 + Firebase (Firestore, Auth, Storage, Hosting) se bana food-delivery
app: browse restaurants, filter/search, cart, checkout, order tracking, aur
saath me restaurant-owner panel + admin dashboard.

---

## Architecture

Feature-based folder structure with a hard core/shared boundary. Ek rule: **koi
bhi feature doosre feature ko import nahi karta.** Sab shared ya core se aata hai.

```
src/
├── app/
│   ├── core/                        # app-wide singletons — ek hi baar inject hoti hain
│   │   ├── firebase/firebase.config.ts   # SDKs yahan ek baar initialise
│   │   ├── guards/                      # authGuard, guestGuard, roleGuard
│   │   ├── models/                      # readonly TS interfaces, Firestore ka shape
│   │   ├── pipes/                       # Angular pipes (logic utils mein hai)
│   │   ├── services/                    # Auth, User, Restaurant, Cart, Order, Address, Storage, Toast
│   │   └── utils/                       # pure functions: date, format, errors, order-status
│   ├── shared/                      # presentational components, feature-agnostic
│   ├── layout/                      # shell: header, router-outlet, footer, toasts
│   ├── features/                    # lazy-loaded route chunks
│   │   ├── home/  restaurants/  restaurant-detail/
│   │   ├── auth/  cart/  checkout/  orders/
│   │   ├── account/  owner/  admin/  not-found/
│   │   └── app.routes.ts
│   ├── app.ts
│   └── app.routes.ts
├── environments/
│   ├── environment.ts               # dev (default)
│   └── environment.production.ts     # production build me fileReplacement se swap
└── styles/
    ├── _tokens.scss                  # design tokens (CSS custom properties)
    └── _base.scss                    # element defaults + btn/field/card primitives
```

### Deliberate decisions (aur kyun)

| Decision | Reason |
|---|---|
| Standalone components, `ChangeDetectionStrategy.OnPush` har jagah | Default Angular naye apps me hai; OnPush renders ko skip karta hai jab signal nahi badla. |
| Signals + `computed()` for UI state; RxJS sirf Firestore streams ke liye | Firestore Observable deta hai — `toSignal()` se template dono worlds me kaam karta hai. |
| `withComponentInputBinding()` | Route params seedhe signal `input()` ban jaate hain — manual `ActivatedRoute` subscription hat jaata hai. |
| Menu items `restaurants/{id}/menuItems` subcollection me | 200 dishes wala restaurant home-page listing ka data nahi badhata. |
| Cart `localStorage` me, Firestore me nahi | Cart ephemeral hai aur checkout screen par refresh survive karna chahiye. Order document hi durable record hai. |
| Image backend `IMAGE_STORAGE` token ke peeche | Firebase ne Cloud Storage paywall ke peeche kar diya. Provider swappable rakhne se future switch ek line ka kaam hai, rewrite ka nahi. |
| `customer` ko bhi `/owner` khula hai | Restaurant publish karna hi owner banata hai, aur wo sirf is panel se ho sakta hai. Role guard me sirf `owner` rakhne par deadlock ban jata tha — koi kabhi owner nahi ban pata. Ye tabhi pata chala jab live site par signup karke `/owner` khola. |
| Image backend `IMAGE_STORAGE` token ke peeche | Firebase ne Cloud Storage paywall ke peeche kar diya. Provider swappable rakhne se future switch ek line ka kaam hai, rewrite ka nahi. |
| Line items order document me denormalised | Restaurant baad me dish rename/delete kare to bhi order history readable rehti hai. |
| Filter state URL query params me | Filtered view shareable hai, refresh pe bachta hai, back button sahi chalta hai. |
| Guards `whenReady()` / `whenProfileReady()` ka wait karte hain | Auth async resolve hota hai — bina iske protected route pe refresh karne par user 2 frame ke liye `/login` pe bhej diya jayega. |
| Roles Firestore se padhi jaati hain, client claim se nahi | `roleGuard` sirf UX gate hai. Asli enforcement `firestore.rules` me hai. |

---

## Setup

### Ek hi project hai: `zaika-hub-prod`

| | |
|---|---|
| Firebase project | `zaika-hub-prod` (442698702) — "ZaikaHub Prod" |
| Web app | "ZaikaHub Web" |
| Hosting | live at **https://zaika-hub-prod.web.app** |
| Auth | Email/Password enabled |
| Firestore rules + indexes | deployed |
| Images | Cloudinary (free tier) — see below |
| Java 21 | `G:\Softwares\Java\jdk-21.0.12.1+1`, on your user `PATH` |

Local development safe is tarike se chalti hai: `environment.ts` me
`useEmulators: true` hai, matlab `npm start` ka koi bhi read/write **local
emulator** me jaata hai, asli project me nahi. Production build
(`environment.production.ts`) me ye flag `false` hai.

---

## Images: Cloudinary, aur Blaze par kaise wapas jaen

### Cloudinary kyun, Firebase Storage kyun nahi

Firebase ne Cloud Storage ko **Blaze (billing) plan ke peeche** kar diya hai
(Feb 2026 se) — default bucket bhi. Matlab Storage ke liye credit card lagna
padta. Is project ne ise avoid kiya:

| | Blaze (Firebase Storage) | Cloudinary |
|---|---|---|
| Credit card | zaroori | kabhi nahi |
| Free quota | 5 GB stored, 1 GB/day download | 25 credits/month |
| Code change | zero | zero (pehle se likha hua) |
| Upload progress | exact bytes | estimated (fetch limitation) |

### Setup (ek baar)

1. Cloudinary console → free account (no credit card)
2. **Settings** → copy your **Cloud name**
3. **Settings → Upload → Upload presets** → **Add upload preset**:
   - Signing mode: **Unsigned**
   - Folder: `zaika-hub` (wahi jo code use karta hai)
   - Allowed formats: jpg, png, webp, avif
   - Max file size: 5 MB
4. Dono values `src/environments/environment.ts` aur
   `environment.production.ts` ke `cloudinary` block me daalo

App startup par validate hote hain — placeholder rehne par ek saaf error
aata hai, blank page nahi.

### Structure

```
core/services/
├── image-storage.ts                       # interface + shared validation
├── cloudinary-image-storage.service.ts    # active backend
├── firebase-image-storage.service.ts      # kept for switching back
└── image-storage.provider.ts              # IMAGE_STORAGE token
```

Components `IMAGE_STORAGE` token inject karte hain, koi concrete class nahi.
Isiliye dono owner-panel components me Cloudinary ya Firebase — koi farak
nahi padta.

### Firebase Storage par wapas jaana hai

`environment.ts` me **ek line** badlo:

```ts
imageProvider: 'cloudinary',   // →
imageProvider: 'firebase',
```

Bas. Fir:

```bash
npm run deploy:rules           # storage.rules deploy (Blaze required)
```

Purani Cloudinary images chalti rahengi — Cloudinary ka free plan expire
nahi hota. Nayi uploads Firebase par jayengi. Agar sab kuch ek jagah
chahiye, `tools/migrate-images.mjs` purani images copy karke Firestore URLs
update karta hai.

### Ek honest trade-off

Cloudinary uploads **anonymous** hote hain — client koi secret nahi bhejta.
Security upload preset se aati hai (format/size whitelist server-side). Ye
Firebase ke per-user authorisation se **kamzor** hai: Firebase me rules check
karti hain ki `request.auth.uid` path segment se match kare. Production ke
liye Blaze wala raasta zyada solid hai.

### Local development

```bash
npm install
npm run emulators              # terminal 1 — UI http://localhost:4000
npm run seed                   # terminal 2 — 4 restaurants, 15 dishes
npm start                      # terminal 3 — http://localhost:4200
```

Seed ka account: `owner@zaikahub.test` / `Owner12345` — isi se `/owner` panel
bhi khulta hai (role `owner`).

`npm run seed` idempotent hai (restaurant/dish IDs slug se derive hoti hain, to
dobara chalane se duplicates nahi bante). Verify: `npm run verify:seed`.

> Emulator ka data memory me hota hai, isliye har `npm run emulators` restart ke
> baad `npm run seed` dobara chalana padta hai. Rules bhi restart par dobara
> load hote hain — `firestore.rules` badalne ke baad emulator restart karo.

---

## Deploy

| Script | Kya karta hai |
|---|---|
| `npm run deploy:hosting` | production build → `zaika-hub-prod` hosting |
| `npm run deploy:rules` | Firestore rules + indexes + Storage rules |
| `npm run emulators` | local emulator suite (needs Java) |
| `npm run seed` | sample data → emulator |

`.firebaserc` ka default `zaika-hub-prod` hai, isliye bare `firebase deploy`
kabhi dev pe nahi jaayega. Har script me `--project` explicitly bhi diya hai.

`firebase.json` me set hai:

- SPA rewrite (`**` → `/index.html`) — deep links 404 nahi hote
- `/` par `no-cache, no-store` — hashed bundle names badalte hain; stale index
  purane (delete ho chuke) bundles point kar deta hai → white screen. Isliye glob
  `/index.html` nahi, `/` hai: Firebase request path se match karta hai aur index
  `/` se serve hota hai.
- hashed assets par 1-year `immutable`
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`

---

## Features

**Customer**
- Home: search, cuisine shortcuts, featured restaurants
- Listing: search + cuisine / price / rating / delivery-time filters, 4 sort orders
- Restaurant detail: menu grouped by category, category tabs, veg/non-veg markers
- Cart: quantity steppers, bill summary, free delivery over ₹399
- Checkout: saved addresses (add inline), payment method, place order
- Orders: live status timeline, reorder from history
- Profile + saved addresses (add / edit / delete / set default)

**Owner** (`/owner`)
- Publish a restaurant (image uploads to Storage)
- Menu manager: add / edit / hide / remove dishes
- Order queue: advance status one step at a time, cancel

**Admin** (`/admin`)
- Order volume, revenue, per-status counts
- Recent orders table
- Feature / unfeature restaurants

Auth: email + password, with a "remember me where you were" redirect so
`/cart` pe login karke wapas wahin pahunchte ho.

---

## Image handling

Sab images `IMAGE_STORAGE` token ke peeche se jaati hain — backend Cloudinary
ya Firebase Storage, dono ke liye code ek jaisa hai (details upar, "Images:
Cloudinary" section).

Shared rules, dono backends par same:

- Folder namespace: `{folder}/{ownerId}` — `restaurants`, `menu-items`, `avatars`
- 5 MB cap aur image MIME whitelist (JPG/PNG/WebP/AVIF), client side par
- Firestore me **URL** store hota hai, path nahi — isliye har read par URL
  resolve karne ki zaroorat nahi
- Filenames sanitise hote hain, path separators aur `$` jaise characters strip
  hote hain, duplicate names me random suffix
- Upload aur form submit alag steps hain: photo upload fail ho jaye to dish ka
  data typed hua nahi udta

Backend-specific:

- **Cloudinary** — uploads anonymous, upload preset whitelist server-side
  control karta hai. Progress estimated (`fetch` real progress nahi deta)
- **Firebase Storage** — `storage.rules` me `request.auth.uid == ownerId`
  check hoti hai, to koi doosre user ki image overwrite nahi kar sakta.
  Progress exact bytes. Blaze plan chahiye

---

## Security

`firestore.rules` aur `storage.rules` source of truth hain. Highlights:

- Role hamesha database se read hoti hai — tampered request apne aap ko admin
  nahi bana sakta
- Self-registration sirf `role: 'customer'` profile bana sakti hai
- User apna role sirf `customer` → `owner` badal sakta hai, aur `restaurantIds`
  list sirf badh sakti hai. `admin` kabhi self-assign nahi ho sakta.
  (`selfPromotionIsSafe()` — ye exception zaroori thi: bina iske poora owner
  panel rules me block ho jata tha. Ye bug tabhi mila jab rules actually chala,
  isliye yahan likha hai taaki koi "tighten" karne ki koshish na kare.)
- Restaurant ownership document ke `ownerId` se check hoti hai; `ownerId` khud
  update nahi ho sakta
- Customer order sirf tab cancel kar sakta hai jab wo abhi `placed` hai, aur
  sirf `status` + `cancelledReason` fields change kar sakta hai — price ya items nahi
- Menu writes sirf us restaurant ke owner ya admin ke liye
- `createdAt` immutable hai — sirf create par likha ja sakta hai

### Firestore rules expression-only hain

Rules me `let`, `if`, loops nahi hote — sirf nested boolean expressions. Isi
liye `selfPromotionIsSafe()` teen `&&`-joined conditions hai, readable
early-returns nahi. Isko "saaf" karne ki koshish rules compile error degi.

### Storage listing denied hai, object read nahi

`storage.rules` me sirf `images/{folder}/{ownerId}/{fileName}` ke liye writes
allow hain, aur bucket listing nahi. Emulator par `list` karne par 403 aana
**expected** hai — object `GET` karna allowed hai (`allow read: if true`),
kyunki restaurant images signed-out visitors ko bhi dikhne chahiye.

### Ek jaan-boojh kar batayi gayi limitation

`OrderService.placeOrder()` totals **client side** compute karta hai. Demo ke
liye theek hai, production ke liye nahi — ek tampered client apna price bhej
sakta hai. Real deployment me ye kaam ek callable function ya Cloud Function
me karna chahiye jo `menuItems` subcollection se price dobara nikale.

Multi-cuisine filtering bhi client side hai, kyunki Firestore ke paas
"array contains any of N values" operator nahi hai. Ek bounded read
(`limit(50)`) par chalata hai — catalogue bade hone par Algolia/Typesense
jaisa search index swap karna sahi raasta hai.

---

## Testing

```bash
npm test          # 43 tests
npm run test:watch
```

Vitest + jsdom. Specs wo logic cover karte hain jahan bugs silently paisa
kharab karte hain:

- `cart.service.spec.ts` — totals, free-delivery threshold, paise tak rounding
- `format.util.spec.ts` — rating tiers, duration/hours formatting, list truncation
- `order-status.util.spec.ts` — status state machine
- `image-storage.spec.ts` — upload validation aur filename sanitisation
- `document-ref.spec.ts` — Firestore write paths (see below)

Business rules `core/utils/` me plain functions hain, isliye inhe test karne
ke liye TestBed ki zaroorat nahi padti aur Firebase SDK import bhi nahi hota.

### `document-ref.spec.ts` — kyun zaroori hai

Ye ek real bug ka regression guard hai. `doc(firestore, 'orders')` likhne se
reference me **odd** number of path segments ban jaate hain, aur Firestore use
**write time par** reject karta hai:

```
Invalid document reference. Document references must have an even number of
segments, but orders has 1.
```

Sirf ye throw hone ki wajah se pehle 39 tests **poore green** the, jabki live
app me order place karna, restaurant banana aur menu item add karna — teeno
kaam chupke se fail ho rahe the. Pehle wale tests Firestore ko poora stub karte
the, isliye reference construction dekh hi nahi paate the.

Ab test asli service methods (`placeOrder`, `createRestaurant`, `addMenuItems`)
call karta hai, sirf network writes stub karke, aur assert karta hai ki
reference ke segments even hain. Sahi form hai `doc(collection(...))`.

Test ko verify karna ho to bug ko wapas daal kar `npm test` chalayein — teeno
tests fail honge.

---

## Commands

| Command | Kaam |
|---|---|
| `npm start` | Dev server, port 4200 |
| `npm run build` | Production build |
| `npm run build:dev` | Unoptimised dev build |
| `npm test` | Vitest suite |
| `npm run lint` | `tsc --noEmit` type check |
| `npm run emulators` | Firebase emulator suite (needs Java) |
| `npm run seed` | Sample data → emulator (idempotent) |
| `npm run verify:seed` | Seed ke baad data verify karta hai |
| `node tools/verify-cloudinary.mjs` | Cloudinary upload + public GET, config validate karta hai |
| `node tools/verify-publish-path.mjs` | Real project par poora publish path (rules included) test karta hai |
| `npm run deploy:hosting:prod` | Production build → prod hosting |
| `npm run deploy:hosting:dev` | Dev build → dev hosting |
| `npm run deploy:rules` | Rules + indexes, dono projects |
| `npm run fix:imports` | Relative import paths normalise karta hai |
| `npm run sitemap` | Firestore se `public/sitemap.xml` regenerate karta hai |
| `npm run icons` | PWA icons generate karta hai (koi image library nahi chahiye) |
| `node tools/fetch-food-images.mjs` | Commons se openly-licensed food photos + `CREDITS.md` |
| `node tools/upload-food-images.mjs` | Unhe Cloudinary + Firestore se jodta hai |
| `node tools/verify-food-images.mjs` | Har image URL sach me resolve hoti hai ya nahi |
| `node tools/audit-seo.mjs` | Live site par meta/canonical/JSON-LD/noindex audit |
| `node tools/seed-highlight-dishes.mjs` | `highlightDishes` ko menus se rebuild karta hai |
| `node tools/verify-highlight-rules.mjs` | Rules public-read + write-blocked hain, confirm |

---

## SEO

Site par koi SEO nahi tha — sirf ek bare `<title>Zaikahub</title>`. Ab:

**Static layer (`src/index.html`)** — description, canonical, Open Graph, Twitter
card, theme-color, manifest, icons, aur Cloudinary ka `preconnect`. Ye sab
**JavaScript se pehle** padhe jaate hain, jo zaroori hai: WhatsApp, Facebook, X
aur LinkedIn ke scrapers JS **execute nahi karte**. Sirf raw response padhte
hain. Isliye ye layer social previews ke liye hi nahi, crawler safety ke liye
bhi zaroori hai.

**Per-route layer** — har route apna `seo` payload `data` me rakhta hai
(`app.routes.ts`), aur `SeoTitleStrategy` usse meta, canonical, Open Graph aur
JSON-LD banata hai. Ye har component ke constructor me copy-paste karne se behtar
hai: copy, canonical path aur indexability ek hi jagah dikhti hai.

**Structured data** — restaurant pages par `Restaurant` schema (rating, price
range, opening hours, menu sections by category) + `BreadcrumbList`. `WebSite`
+ `Organization` + `SearchAction` home par. Yeh Google ke rich results ke liye
sabse zyada impactful hissa hai.

**Discovery** — `public/robots.txt` (private screens disallowed, sitemap linked)
aur `public/sitemap.xml`, jo `tools/generate-sitemap.mjs` Firestore se banata
hai. Restaurant pages dynamic hain, to static sitemap unhe miss kar deta — aur
build time par Firestore padhna free hai (Cloud Function nahi, billing nahi).

### Ek honest limitation: koi SSR nahi hai

Ye app **pure client-side SPA** hai. `index.html` me sirf `<app-root></app-root>`
hota hai — content JavaScript ke baad aata hai.

Iska matlab:
- **Google** JS chalata hai, to index kar lega. Thoda slow, thoda kam reliable.
- **Social scrapers** JS nahi chalate — isliye static layer zaroori hai.
- **Baaqi crawlers** (Bing, DuckDuckGo, kai AI assistants) JS ya render nahi
  karte. Unke liye restaurant pages effectively invisible hain.

Sahi ilaaj **prerendering** hai: build step par har route ka HTML bana lena. Ye
`@angular/ssr` + `RenderMode.Prerender` se hota hai aur build par chalta hai —
runtime billing nahi lagti, to Spark plan par bhi free hai.

Main ye nahi kiya, aur wajah saaf hai: restaurant URLs **Firestore me hain**.
Build time tak pata hi nahi chalta kaunse restaurants exist karenge, isliye
prerender ko pehle route list chahiye — jo build ko Firestore se banana
padega, ya ek manifest file maintain karni padegi. Ye architecture-level
decision hai, isliye aapse poochh kar kiya jaana chahiye, nahi ki chupke se
badal diya jaaye. Bata dijiye to kar deta hoon.

### Images aur `imageProvider`

Sab images Cloudinary par hain, resized on delivery
(`f_auto,q_auto,c_limit,w_...`) — phone par 4K original nahi jaata.

`highlightDishes` ek alag top-level collection hai. Dish `restaurants/{id}/menuItems`
me rehta hai, aur Firestore subcollection ko cross-parent query nahi kar sakta —
toh client side banane ka matlab hota hai ek query per restaurant (N+1). Isliye
merchandising decision alag collection me hai: ek query, curated order. `menuItemId`
wapas asli dish par point karta hai, to price ka doosra source of truth banta hi
nahai.

---

## Images: licensing

Saari food photos **Wikimedia Commons** se hain, sirf yeh licences:

| Licence | Kitni |
|---|---|
| CC0 / Public domain | koi obligation nahi |
| CC BY 2.0 / 3.0 / 4.0 | attribution chahiye |

**Rejected:** CC BY-SA (Share-Alike poori app par propagate ho sakta hai), NC
(non-commercial), ND (no derivatives).

Credit `tools/food-images/CREDITS.md` me hai, har image ke saath render hota
hai (`ImageCreditComponent`), aur Firestore me `imageCredit` field ke roop me
store hota hai. CC BY ke liye attribution **dikhana** zaroori hai, isliye wo
click-ke peeche chhupi nahi hai.

### Ek honest limitation: openly-licensed photos amateur hain

Ye openly-licensed food photography **documentation shots** hai, commercial food
photography nahi. Practical result:

- **Dish close-ups theek hain** — biryani, naan, pizza, brownie, manchurian.
- **"Restaurant ambiance" covers kamzor hain** — thali ki steel tray, aur ek
  biryani jo cardboard box me thi. Ek cover pehle "Vegetarian Samosas at an
  Indian restaurant in Vancouver" aa gaya tha, jisse biryani house samosa shop
  lag raha tha.

Isliye `fetch-food-images.mjs` me `mustMatch` hai: file title me dish ka naam
hona zaroori hai. Licence theek hone ka matlab ye nahi ki photo sahi dish ki
hai — bina filter ke "chocolate brownie" search ne orecchiette pasta return kiya.

`showcase-*` images download hoti hain par app me use nahi hoti (sirf
link-preview image `og-default` ek hai) — wo candidates hain, future use ke liye.

Production me asli food photography chahiye hogi. Do free options: apne photos,
ya Unsplash/Pexels (dono ka licence commercial use allow karta hai, credit
dena zaroori nahi — lekin API key chahiye, isliye fetch script nahi banayi).

---

## Tools: ek zaroori saabit

`tools/audit-seo.mjs` live site par meta, canonical, JSON-LD aur noindex check
karta hai, aur **fail hone par non-zero exit** deta hai. Ye na sirf kaam karta
hai — isse do bugs pakde:

- Restaurant description **196 characters** thi (Google ~155 me kaat-ta hai).
  Ab `restaurantDescription()` poora clause chhodta hai, beech se kaatne ke bajaye.
- Cloudinary CDN **throttle karte waqt 404** deta hai, 429 nahi. Unpaced checks
  ne perfectly theek images ko broken report kiya. `verify-food-images.mjs`
  isliye requests ke beech delay rakhta hai.

---

## Ek debugging note (taaki dobara na ho)

**PowerShell se is repository ki files kabhi edit na karein.** Is project me
teen baar file delete ho chuki hai isse:

1. `Move-Item` ek loop me — source file gayab.
2. `[System.IO.File]::WriteAllText` ek loop me — `seo.service.ts` aur
   `index.html` dono gayab.

`WriteAllText` se content replace karna theek lagta hai, lekin file khatam ho
jaati hai. **Sirf `edit` aur `write` tools use karein.** Isi liye
`fetch-food-images.mjs` ab `rmSync` se output folder wipe nahi karta — pehle us
ne 12 successfully download kiye photos mitaa diye the.

---

## Design system

`src/styles/_tokens.scss` me saare visual decisions CSS custom properties hain —
brand colour (`#e23744`), neutrals, rating tiers, spacing scale (4px base),
radii, shadows, z-index. Theming ya dark mode ke liye ek chhoti si file badalni
hai, poori codebase nahi.

`src/styles/_base.scss` me sirf woh primitives hain jo ek se zyada jagah use
hote hain (`.btn`, `.field`, `.card`, `.badge`, `.veg-dot`). Feature-specific
styles us feature ke apne `.scss` me rehte hain.
