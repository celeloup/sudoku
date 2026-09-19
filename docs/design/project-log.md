# Project log

What was decided, and what to build next. Every decision below was made on 18 Sep 2026 and is already applied in the design system. The audit at the end lists what is still missing.

## Decisions

| #   | Question                                                | Outcome                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which fonts, and are they free to use on the web?       | [Agdasima](https://github.com/docrepair-fonts/agdasima-fonts) Regular for the big number, [Akatab](https://github.com/silnrsi/font-akatab) Bold for NO. and difficulty, Inter for grid digits and DE POCHE. All under the SIL Open Font License 1.1, so web embedding is allowed. |
| 2   | Darker ink for digits and text on screen?               | Yes. True orange on white is 2.95:1, under the 3:1 minimum. Lines, fills and print keep the true orange.                                                                                                                                                                          |
| 3   | Which starter inks?                                     | Clémentine, Piscine, Menthe, Encre. Bonbon and Prune removed for now.                                                                                                                                                                                                             |
| 4   | One ink per area, or the whole app in the player's ink? | One per area: Play Clémentine, Learn Piscine, Print follows the notebook.                                                                                                                                                                                                         |
| 5   | Page ratio                                              | Withdrawn. The artwork was larger than A7 because it includes bleed and margins. The trimmed page is A7.                                                                                                                                                                          |
| 6   | Seed in monospace, without look-alike characters?       | Yes. JetBrains Mono, alphabet without `0 O 1 l I`.                                                                                                                                                                                                                                |
| 7   | How far to push handmade?                               | Stop at flat ink, hard shadows, tilt and stickers. No hand-drawn illustration for now.                                                                                                                                                                                            |
| 8   | Interface language                                      | French and English. Proper names stay French.                                                                                                                                                                                                                                     |
| 9   | The wordmark's source font is unknown                   | Accepted. The letters were flattened and reshaped by hand, the project is not commercial, and they can be redrawn from an open font later.                                                                                                                                        |
| 10  | Where do print values live?                             | The generator is the source of truth for puzzle pages. Figma is kept for the cover only.                                                                                                                                                                                          |
| 11  | Print margins                                           | 3 mm bleed, 4 mm safe margin, 12 mm binding zone at the top.                                                                                                                                                                                                                      |

Decided on 19 Sep 2026, while building the print grid.

| #   | Question                                       | Outcome                                                                                                                                                                                                                         |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | How are the two print line weights drawn?      | As gaps in a nested 3×3 of 3×3 grids over an ink background, not as cell borders. A 1.45 pt border takes its width from the column it sits on, leaving the three boxes unequal by about 0.26 mm. A gap takes it from the whole. |
| 13  | How is print type sized?                       | By cap height, which is what a ruler measures: `font-size-adjust: cap-height 0.72` against a font size of target ÷ 0.72. The capitals hit the spec even when a font fails to load. Chromium only today.                         |
| 14  | How many A7 pages per A4 sheet at home?        | Four, not eight. Eight tiles edge to edge, so the outer columns fall in the strip a home printer cannot reach. Eight stays for a shop that prints oversized and trims.                                                          |
| 15  | Who imposes the sheet?                         | The app. The print dialog's "pages per sheet" scales pages to fit, which voids every measurement in the test print.                                                                                                             |
| 16  | Where does the seed sit against the safe line? | Its descender, not its baseline. The safe line is a clearance rule and the seed alphabet still contains p, q and y.                                                                                                             |

## Build order

1. Done, 19 Sep 2026. The tokens are in `src/tokens.css`, including the print geometry the Print spec had measured but never named.
2. Built, 19 Sep 2026: the grid's `print` variant and the A7 page around it, at `src/print.html`. **The test print has not been run yet** — every value below is measured in a browser, not with a ruler on paper.
3. Done, 19 Sep 2026. The `play` grid states, the number pad, the button and the Play screen itself, at `src/index.html`, `src/play.css` and `src/ui/play.ts`. The old engine harness (`src/ui/main.ts`, `src/ui/board.ts`, `src/styles.css`) is gone. Puzzle generation moved into a Web Worker on the way, so the screen stays responsive through Hard's multi-second tail.
4. Build the Print screen. It exercises the theme model end to end.
5. Everything else.

Measured off the rendered page, 19 Sep 2026: page 73.95 × 104.97 mm, grid 65.35 mm centred with 4.30 mm each side, both 2.2 mm gaps exact, cap heights 10.60 and 2.00 mm, seed clearing the safe line by 4.23 mm.

## Audit, 18 Sep 2026

The design system is a solid version 0.1, not a finished system. Foundations are strong, one component of twelve is fully specified, nothing is drawn, and three contrast bugs sit in the grid states.

**Components reviewed:** 12 | **Issues found:** 19 | **Score:** 58/100

**Fixed the same day:** all three contrast bugs, all five naming issues, and every raw value in the token coverage table. Still open: dark mode, component depth, drawings, layout rules, voice and tone, and proof on a real screen. The tables below are kept as the record of what was found.

### Bugs in the current spec

| Issue                                                                    | Measured                                                   | Fix                                                                                                                            |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Given digits lose contrast in the same-digit state                       | 2.45:1 on a tinted box in Clémentine and Menthe; needs 3:1 | Show same-digit with a ring or underline instead of a 22% fill, or compute `--ink-strong` against the darkest state background |
| Given digits lose contrast in the peer state on tinted boxes             | 2.70:1 in Clémentine, 2.72:1 in Menthe                     | Same fix. Piscine and Encre pass                                                                                               |
| Candidate notes are specified for paper only, but appear in tinted boxes | `--pencil-soft` on tint is 4.3:1; needs 4.5:1              | Darken `--pencil-soft` to `#62616C`, which passes on all four tints, or use `--pencil` for notes                               |

### Naming consistency

| Issue                                                                  | Where                                                                                                                            | Recommendation                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| The rule says category first, but six color tokens have no category    | `--paper`, `--pencil`, `--pencil-soft`, `--correction`, `--tint`, `--wash`                                                       | Either prefix every color with `--color-`, or state that color tokens are the exception |
| Three step conventions                                                 | `--space-1` to `8` (numbers), `--radius-sm` and `md` (sizes), `--dur-fast`, `base`, `slow` (words), plus `--radius-0` mixing two | Pick one per kind and say which: numbers for scales, words for roles                    |
| Type sizes use two prefixes                                            | `--text-xs` to `xl`, then `--display-md` and `lg`                                                                                | Keep both, but say why: text sizes are for reading, display sizes are for showing       |
| A theme is called Encre, French for ink, and the main token is `--ink` | Color                                                                                                                            | Rename the theme, for example Graphite or Nuit                                          |
| The third area has two names                                           | Print in navigation and patterns, booklet elsewhere                                                                              | Choose one word for the interface and one for the object                                |

### Token coverage

| Category           | Defined          | Raw values still in component specs                                                      |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------- |
| Color              | 9                | Overlay strengths 6%, 22%; opacities 35% and 40%                                         |
| Spacing and size   | 8                | 36, 44 and 48 px targets, 540 px grid cap, 900 px breakpoint, 3 px rings, 2 px focus gap |
| Typography         | 4 fonts, 7 sizes | Digit size 0.8 × cell, notes at 28% of cell, font weights                                |
| Motion             | 5                | Stamp scale 1.3, press offset 3 px                                                       |
| Not defined at all |                  | Breakpoints, layers (z-index), opacity steps, icon sizes, dark mode                      |

### Component completeness

| Component         | States  | Variants | Accessibility | Drawn      | Score |
| ----------------- | ------- | -------- | ------------- | ---------- | ----- |
| Grid              | Yes     | Yes      | Yes           | No         | 8/10  |
| Button            | Yes     | Yes      | No            | No         | 5/10  |
| Number pad        | Yes     | Yes      | No            | No         | 5/10  |
| Segmented control | Yes     | Partial  | Partial       | No         | 5/10  |
| Swatch picker     | Yes     | Yes      | Partial       | No         | 5/10  |
| Puzzle number     | n/a     | Yes      | No            | Print only | 4/10  |
| Difficulty tag    | n/a     | Yes      | No            | Print only | 4/10  |
| Seed label        | Partial | Yes      | No            | Print only | 4/10  |
| Sticker           | Partial | Yes      | No            | No         | 4/10  |
| Card              | Yes     | Yes      | No            | No         | 4/10  |
| Top bar           | Partial | Yes      | No            | No         | 4/10  |
| Stepper           | Partial | No       | No            | No         | 3/10  |

Not in the inventory yet: dialog, inline message and toast, text and color inputs, link, icons, timer, hint and undo controls, and a progress state for booklet generation.

### Also missing

- Any picture of a component or a screen. The only images are the swatch sheet and your two print pages.
- Layout rules for screens: columns, breakpoints, maximum widths.
- Voice and tone: how the app speaks in French and in English, with examples.
- A dark mode decision.
- ~~Proof. No token has been used in a real screen yet~~ — **closed, 19 Sep 2026.** The three new inks still have not been printed.

### Priority actions

1. Done. Contrast: `--ink-strong`, `--ink-deep` and `--pencil-soft` are now computed against the darkest cell background. Same-digit is a bar, not a fill. Clémentine `--ink-strong` moved from `#DD6523` to `#D15F22`.
2. Done. Naming: color tokens are a stated exception, step conventions are written down, `--radius-0` became `--radius-none`, the Encre theme became Graphite, and the object is a notebook, never a booklet. Raw values became 20 new tokens for sizes, layers, lines, weights, scales, opacity and motion.
3. Done, 19 Sep 2026. See "What the Play screen proved" below.
4. Draw the components, in Figma or in code, so each has a picture next to its rules.
5. Expand components to the grid's level of detail as you build them, not before.

## What the Play screen proved, 19 Sep 2026

Priority action 3 said: build the grid and one full screen from the tokens, and whatever feels wrong there is the real audit. It is built. This is what it found.

**The theme model holds.** A whole screen — grid, number pad, buttons, dialog, sticker, message — is drawn without a single raw value outside `src/tokens.css`. Changing `data-theme` on `<html>` recolors all of it. The audit's largest open item, "no token has been used in a real screen yet", is closed.

**It found one hole in the model.** The Color rule said the app picks whichever of `--pencil` and `--paper` scores higher on an ink fill, but CSS cannot compute that at runtime, and the number pad had shipped with `--tint` on `--ink` at 2.5:1. The fix is `--on-ink`, a sixth theme token holding the per-theme answer. A rule the code cannot express is not a rule; this is the kind of thing only a built screen surfaces.

**Two gaps in the grid's spec surfaced too.**

- The Notes state described a cell with marks, but not a selected empty cell offering nine toggle targets. Drawn literally, every selected cell read as "all nine noted". The cell states table now says what an empty selected cell shows.
- The Solved row was written and then half-built: the sticker landed, but the digits did not turn `--ink-strong` and the grid still took input. Both are done now, and `isComplete` gates every mutation through one guard, with undo as the deliberate way back out.

**The fonts were not actually ready.** Only `inter-700.woff2` was subsetted. A family declared at one weight answers every weight request with it, which would have erased the given-versus-entered distinction — the one difference that survives the Graphite theme and color blindness. Inter 400, 500 and 600 are now in `src/fonts/`.

**Still open after this screen:** dark mode, drawings of components, voice and tone, and the test print. The remaining nine components keep their one-row entries until they are built.
