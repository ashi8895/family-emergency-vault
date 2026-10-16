# Design notes

## The idea

The Indian household **tijori**: the steel almirah locker with a combination dial and brass hardware. The product is about trust and a lock, so the look borrows from an object every family already trusts.

| Token (in `apps/web/tailwind.config.js`) | Colour | Job |
|---|---|---|
| `seal` | almirah green `#1F5C4E` | safe, done, primary actions |
| `vault` | deep green `#0E2F28` | the dark door: landing page, header, the calm status panel |
| `brass` / `brass-bright` | `#8A5F0F` / `#C9962D` | hardware: highlights, attention, warnings |
| `sindoor` | `#B42B23` | danger and errors only (remove, wrong code, emergency banner) |
| `paper` | `#EEF2EF` | the page: steel white with a green breath |
| `ink`, `muted`, `line` | text, secondary text, hairlines | |

Change the theme by editing those values. Components use the token names, not hex codes.

**Type:** Bricolage Grotesque for headlines (a bold, slightly quirky grotesque) and Mukta for body text. Mukta also covers Devanagari, so Hindi falls back to it automatically. Tight letter-spacing is applied to English headlines only, because it would crowd Devanagari.

## Where the boldness is spent

One place: **the vault dial on the landing page.** In the hero the sign-in form sits in the middle of the door. Below, as you scroll, a sticky panel keeps the dial on screen: it turns with your scroll position, the key (a ring drawn as three arcs) splits into its pieces when the story reaches "Split the key", and rejoins at "Family opens it together". Each step opens as you reach it.

Everywhere else the app is deliberately calm: outlined panels, one filled panel per screen for the thing that matters (the status block on the Safety switch), and a family page built for people who are stressed.

## Motion rules

- Motion explains a change: the brass rule sliding under the active tab, the tab content easing in, the story step opening, skeletons while data loads.
- No entrance animations on every section, no hover lifts on every card.
- Scroll-driven motion writes CSS variables straight to the element inside `requestAnimationFrame` (no React re-render per frame) and only touches React state when the step changes. Only `transform` and `opacity` animate.
- `prefers-reduced-motion` turns off the automatic animations. Scroll-driven rotation stays, because the reader controls it.

## Accessibility

- Colour pairs were chosen for readable contrast (green on white, brass text on its tint, white on the dark green).
- A visible brass focus ring on every control.
- Decorative graphics (`VaultDial`, the logo mark) are `aria-hidden`.
- The family page: large type, a larger-text switch, English and Hindi, a print button.

## How it was checked

The pages were compiled with the real Tailwind build and photographed in a headless browser at desktop and phone widths, with the API mocked. This caught real problems that a code review would not: a dial that collapsed to zero size, a mobile overflow of 132 px, a header that wrapped, and a missing import. Web fonts could not be loaded in that environment, so spacing with the real fonts may differ slightly: look at the live page once.

## Files

`index.css` (components, dial, motion) · `components/VaultDial.tsx` · `components/ScrollStory.tsx` · `components/Logo.tsx` · `pages/AuthPage.tsx` (landing) · `pages/VaultPage.tsx` (header and tabs)
