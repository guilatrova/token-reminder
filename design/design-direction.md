# Design direction

Decided in [design-interview.md](design-interview.md). This file is the specification the panel is built from.

## Principles

- Clean like Orca's own Usage list, but alive: colour and a bar tell the state before any text is read.
- Lean: one line per account. Detail opens on demand. No header, no cards, no nested surfaces and no divider
  lines; spacing groups things.
- The panel draws what `src/core/report.ts` works out. It computes nothing about usage, alerts or advice.

## Surfaces

- **Status bar item** (`gauge` icon): the most pressing account, "Codex 85% left · 6d 4h", neutral, yellow or red.
- **Panel** (`gauge` icon, right sidebar): an HTML page, because Orca's declarative components cannot colour a bar or
  draw the gauge. Orca's icon list has no token or coin, so `gauge` stands for the fuel-gauge idea.

## Colour

Everything comes from Orca's theme variables so the panel follows the person's theme:

| Role                | Value                                              |
| ------------------- | -------------------------------------------------- |
| Page                | `--orca-background`                                |
| Text                | `--orca-foreground`                                |
| Secondary text      | `--orca-muted-foreground`                          |
| Faint text          | `--orca-muted-foreground` at 70% opacity           |
| Hairline            | `--orca-border`                                    |
| Quiet fill (advice) | `--orca-muted`                                     |
| Hover fill          | `--orca-accent`                                    |
| Bar track           | `--orca-foreground` at 12%, mixed with transparent |
| Focus ring          | `--orca-ring`                                      |

Orca has no status colours, so the panel defines three, once, keyed on the `dark` / `light` class Orca sets on
`<html>`:

| Level     | Meaning    | Dark      | Light     |
| --------- | ---------- | --------- | --------- |
| `ok`      | On track   | `#34d399` | `#059669` |
| `warning` | Spend soon | `#fbbf24` | `#d97706` |
| `urgent`  | Spend now  | `#f87171` | `#dc2626` |

A level class (`lvl-ok`, `lvl-warning`, `lvl-urgent`) sets one `--c` custom property; everything coloured by state
reads `--c`.

## Type and spacing

- `13px/1.4` system UI font, tabular numbers. Names `14px/600`. Secondary text `12px`. Footer `11px`.
- Panel padding `6px 16px 16px`. Row padding `10px 0`. Grid gap `8px`. Detail is indented `30px` (under the name).
- Radii: avatar `7px`, advice `8px`, bars and tanks fully rounded or `3px`.

## The account row

One `<button aria-expanded>` per account, a grid of seven cells:

`avatar 22px | name and plan | bar (1fr, min 48px) | tanks | % left 60px | time 50px | chevron 12px`

- **Avatar**: the provider's own mark at `14px`, the same ones Orca's usage meter shows, on the quiet fill with a
  hairline border. A provider without a mark shows its first two letters, `10px/700`.
- **Name and plan**: plan in secondary text, as the provider spells it.
- **Bar**: only while the account is closed. See "The pace bar".
- **Tanks**: one `9 x 12px` block per unused reset, coloured by that reset's own level; neutral (secondary text
  colour) when its level is `ok` or unknown.
- **% left**: the number in the account's level colour, `650` weight, then "left" small in secondary text. **Time**
  to the main window's reset, secondary text.
- **Hover**: the row takes the hover fill, `8px` radius, bleeding `8px` into the panel's padding. No underline.
- **Chevron** rotates 90 degrees when open.

Accounts that need spending (level not `ok`) start open. A person's own open or close choice wins and is kept while
the panel stays open, across refreshes.

## The pace bar

The bar is the window, read left to right as both the plan and the clock:

- **Fill**: the share of the plan already used, in the level colour, from the left edge.
- **Tick**: a `2px` vertical line in the text colour at the share of the window's time already gone, with a `2px` halo
  in the page colour, sticking `3px` out above and below.
- **Hatch**: where the tick is ahead of the fill, the stretch between them is striped at 45 degrees in the level
  colour at 60%. That is the plan that should have been spent by now, and is on course to go unused.
- The empty track to the right of both is what is left.
- **Slim at rest, fat on hover**: the bar is `4px` high. Hovering the row (or the bar in the detail) thickens it to
  `14px` and shows the share used, in `10px/700`: inside the fill at its right end, in the page colour, or just
  after the fill when the fill is under 15% wide. The bar keeps a `14px` box, so thickening moves nothing.
- With an unknown reset time there is no tick and no hatch.
- The fill grows from 0 in `0.7s`; the hatch fades in after it. No motion under `prefers-reduced-motion`.

## The detail

Opens under the row with a `0.25s` height transition. In order:

1. The account (email), faint, when known.
2. The pace bar again, full width.
3. A note, when the at-risk share rounds to 1% or more: "~62% about to go unused" in the level colour and `600` when
   the main window is alerting, otherwise "~14% may go unused" in secondary text.
4. One line per deadline: a `6px` dot, a label, the date ("Tue, Nov 24"), and the time left in `600`. The dot and the
   time take the deadline's level colour when it is not `ok`.
   - Main window: "Weekly limit resets".
   - Other windows: "Session limit resets · 60% left".
   - A reset: "Reset expires", or "Reset expires unused" when its level is not `ok`.
   - An unknown date or time reads "unknown".
5. Advice, when the report carries it: a quiet-fill box with a lightbulb, "Use the 85% before Tue, Nov 24 and you can
   cash in a reset. That is about 14% a day." The second sentence is left out when the report gives no daily pace.

## Other states

- **Reading, first time**: three placeholder rows in the shape of an account row (avatar, name, bar, share, time),
  filled with the bar-track colour and a slow sweep of light; no sweep under `prefers-reduced-motion`.
- **Read failed, nothing to show**: the error in the urgent colour and a "Try again" button.
- **Read failed, report on screen**: the report stays; the toolbar shows the error on its left.
- **No accounts**: "No accounts yet" and, in secondary text, "Add an account in Orca and it shows up here."
- **Unavailable account**: the row shows the avatar, the name and "Unavailable" in the warning colour; it does not
  open. Its reason is always shown beneath, in secondary text.
- **A plan with no window**: the row shows "–" for the share and the time and no bar; the detail says "This plan
  reports no usage window."

## Toolbar

The first line of the panel: two `24px` icon buttons on the right, alert rules (gear) and refresh. The refresh icon
spins while a read is running. There is no title and no "updated" text.

## Credit

Under the list, centred, one tiny link in faint text (`10px`): "Who created this?". It opens the author's GitHub page
in the system browser. It is left out where Orca cannot open links.

## Alert rules

The gear swaps the list for the rules; a back button ("‹ Alert rules") returns. Under it, one sentence: "Warn me when
a reset is close and a lot is still unused."

One row per rule, with no divider lines: a `4px` colour bar, then three labelled selects ("Reset within", "Unused at least", "Alert") and a
remove button. Below: "+ Add rule" and "Defaults". Every change is saved at once.
