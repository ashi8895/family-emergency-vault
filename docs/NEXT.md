# Where the project stands (handoff note)

Paste this file into a NEW chat, attach the zip, and ask for ONE item from "Still to do". Short chats use far less of a free plan than one very long chat.

## Finished and checked
Phases 1 to 5 plus the redesign (`phase6-design` zip): encryption, trusted people, Shamir key pieces, safety switch, family access page (English and Hindi), audit log, two-step sign-in, docs, and the new look. `npm run typecheck` passed on the owner's machine for that version; 47 server tests and 48 web tests passed.

## Added after that, NOT yet typechecked or looked at in a browser
- `src/ui/` : toasts and an in-page confirm dialog (`UiProvider`), a slide-in `Drawer`, `Collapse`, the `AppearanceMenu` (4 colour themes, larger text, reduce motion), `usePresence`
- `src/appearance.ts`, `src/lib/themes.ts` (+ test that checks contrast of every theme from the real CSS)
- `src/lib/vaultList.ts`, `pins.ts`, `activity.ts` (search, sort, pin, activity filters) with tests
- `index.css`: colours are now CSS variables so themes switch without a rebuild
- `pages/VaultPage.tsx` rewritten: item editor opens in a drawer, search (press /), sort, pin stars, shortcut n
- `components/ItemEditor.tsx`: `variant="drawer"` and the in-page delete confirmation

First thing to do after copying: `npm run typecheck` and `npm run test` (web should show 70 tests). Send any errors.

## Still to do (each is small; do one per chat)
1. `ContactsPanel`, `SwitchPanel`, `EmergencyBanner`: replace the browser `confirm(...)` with `const { confirm, toast } = useUi()` and add toasts after invite, copy link, save permissions, create key pieces, check-in, close access.
2. `ContactsPanel`: animate the "what can they see" editor with `<Collapse>`.
3. `SecurityPanel`: filter chips for the Activity list using `lib/activity.ts` (`ACTIVITY_FILTERS`, `filterEntries`, `countByFilter`), and toasts for copy, turn on, turn off.
4. Look at it in a browser and fix anything odd (drawer, search, pins, each theme).

## Doing the rest without any AI
`docs/deploy.md` (live link), `docs/interview-guide.md` (study plan), push to GitHub (`git init`, `git add .`, check `.env` is NOT listed, `git commit`, `git push`).
