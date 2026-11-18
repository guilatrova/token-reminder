# Design direction

Decided in [design-interview.md](design-interview.md). This file is the specification the panel is built from.

## Principles

- Clean like Orca's own Usage list, but alive: colour and a bar tell the state before any text is read.
- Lean: one line per account. Detail opens on demand. No header, no cards, no nested surfaces and no divider
  lines; spacing groups things.
- The panel draws what `src/core/report.ts` works out. It computes nothing about usage, alerts or advice.

## Surfaces

- **Status bar item** (`gauge` icon): it shows only while something needs spending, and stays out of the status bar
  when every account is on track. Its text is the most pressing account, yellow or red: "Grok: spend 74% in 20h", or
  "Codex: use a reset in 4d 9h" when a rate limit reset is what is about to be lost, with " · +1" when more accounts
  need spending. Its tooltip lists every one of them with the day: "Grok: spend 74% by Thu, Nov 19 (20h) · Claude:
  spend 58% by Fri, Nov 20 (1d 14h)". Orca draws a tooltip as one paragraph, so there are no line breaks.
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

Critical indicators slowly alternate between red and orange. Reduced motion keeps them red.

A level class (`lvl-ok`, `lvl-warning`, `lvl-urgent`) sets one `--c` custom property; everything coloured by state
reads `--c`.

## Type and spacing

- `13px/1.4` system UI font, tabular numbers. Names `14px/600`. Secondary text `12px`. Footer `11px`.
- Panel padding `6px 16px 16px`. Row padding `10px 0`. Grid gap `8px`. Detail is indented `30px` (under the name).
- Radii: letter avatar `7px`, advice `8px`, bars and tanks fully rounded or `3px`.

## The account row

One `<button aria-expanded>` per account, a grid of seven cells shared by the whole list, so names, bars and numbers
line up from row to row and every bar is the same length:

`avatar 22px | name and plan | bar (1fr, min 48px) | tanks | % left 60px | time 50px | chevron 12px`

- **Avatar**: the provider's own mark at `18px`, the same ones Orca's usage meter shows, with nothing around it: no
  box and no border. A provider without a mark shows its first two letters, `10px/700`, on the quiet fill.
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
- **Slim at rest, fat on hover**: the bar is `4px` high. Hovering it thickens it to `14px` and shows a tooltip at the
  end of the fill, "26% used": popover colours, a hairline border, `6px` radius, `11px/600`. Above the bar in a row,
  below it in the detail. The bar keeps a `14px` box, so thickening moves nothing.
- **Rule marks**: each plan rule of the account is a `2px` dashed vertical line, as tall as the bar's `14px` box, at
  the share used where the rule stops matching (a rule with "≥ 50% left" sits at 50% used). It takes the rule's
  colour; a rule with no colour is drawn in secondary text colour. Rules at the same place show as one mark, the most
  severe. Pointing at a mark thickens its line to `4px` and shows a
  tooltip in place of the bar's: "24% to go" in `600`, and under it the rule in secondary text, "Yellow: ≤ 2d to
  reset, ≥ 50% left". A mark the fill has passed disappears: that rule can no
  longer match in this window. Reset rules draw no marks.
- With an unknown reset time there is no tick, no hatch and no marks.
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
6. A way out, when the provider has a usage page of its own: a quiet `12px` button in secondary text, "Open usage on
   claude.ai" with a small external-link icon, that takes the hover fill and opens the page in the browser. Claude has
   one, because its limit resets only show there. It is left out where Orca cannot open links.

## Other states

- **Opening the panel**: the worker answers from its last read, so the list shows at once; when that read is over
  2 minutes old a new one runs behind it and the list updates when it lands.
- **Reading, nothing to show yet**: three placeholder rows in the shape of an account row (avatar, name, bar, share, time),
  filled with the bar-track colour and a slow sweep of light; no sweep under `prefers-reduced-motion`.
- **Read failed, nothing to show**: the error in the urgent colour and a "Try again" button.
- **Read failed, report on screen**: the report stays; the toolbar shows the error on its left.
- **No accounts**: "No accounts yet" and, in secondary text, "Add an account in Orca and it shows up here."
- **Unavailable account**: the row shows the avatar, the name and "Unavailable" in the warning colour; it does not
  open. Its reason is always shown beneath, in secondary text.
- **A plan with no window**: the row shows "–" for the share and the time and no bar; the detail says "This plan
  reports no usage window."

## Toolbar

The first line of the panel: two `24px` icon buttons on the right, settings (gear) and refresh. The refresh icon
spins while a read is running. There is no title and no "updated" text.

## Credit

Under the list, centred, one tiny link in faint text (`10px`): "Who created this?". It opens the author's GitHub page
in the system browser. It is left out where Orca cannot open links.

## Settings

The gear swaps the list for the settings; the two hand over with a short fade (`90ms` out, `160ms` in with a `4px`
rise), not a cut. Its first line takes the toolbar's place and is the same `26px` high: a back icon button and the
title "Settings" (`14px/600`); a failed save shows its error on the right of that line and the previous values stay.
The first section starts where the account list does. Sections are spaced apart, each under an `11px/600` uppercase
label in faint text. One surface: no cards, no borders, no dividers. Every change is saved at once.

Explanations are tooltips, not text on the page: a label that has one is followed by an `11px` info mark in faint
text, and pointing at either opens the explanation under the label (popover colours, hairline border, `11px`, up to
`250px` wide).

**General.** First, because it never changes. One line that is the switch itself (`<button role="switch">`): "Alert in
the status bar" in `600`, with the tooltip "Shows next to Orca's usage only while a plan or a reset needs spending.", and a `28 x 16px`
switch on the right, `ok` green when on. The line takes the hover fill. On by default. When off, the item leaves
Orca's status bar and the worker stops its 10-minute reads; the panel still reads when it opens.

**Alerts.** Under the label, a row of tabs says whose rules are on screen: "General", then one per account with the
provider's mark at `14px` before its name (and the login when a provider has more than one). Tabs are `12px/600` in
secondary text; the selected one takes the hover fill. Changing tabs fades only the rules under them.

Each tab shows two groups, each under a `13px/600` title with its tooltip:

- **Weekly reset**: "Warn me when a weekly reset is close and a lot is still unused. Each rule is a mark on the bar."
  Times from 6h to 7d, shares from 10% to 90%.
- **Rate limit reset**: "Warn me when a rate limit reset is about to expire unused." Times from 1d to 30d, shares
  from 0% to 90%.

An account's group replaces the general one for that account. Until it has one it reads "Follows the general rules."

What can be done to a group sits in one line under its rules, at their indent, near what it changes and not at the
panel's far edge: "+ Add rule" first (`11px/600`, secondary text), where the new rule will appear, then the rare one
in faint text: "Restore defaults" on the general tab, "Use the general rules" on an account's own group. A group that
follows general has "Customize" there instead, which copies the general rules in. All turn the text colour on hover.

One row per rule, read as a sentence:

`Yellow ▾ | ≤ 2d ▾ to reset | ≥ 50% ▾ left` (a reset rule says "to expire" and omits the share when its minimum is zero)

- The rows sit `10px` in from the group's title and share one grid, so the words line up from rule to rule. They
  are compact: `2px` of padding above and below.
- The three values are native selects drawn as words: no box, `12px/600` (the words between them `11px`), a tiny caret, and the bar-track colour as
  the fill when pointed at. The colour select offers "No colour", "Yellow", "Red" and "Critical"; it takes the rule's colour,
  which is the only colour on the row. A rule with no colour never alerts: it only marks the bar, as a spend to aim for.
- The row takes the hover fill (`8px` radius, bleeding `8px` into the padding) when pointed at or focused within; only
  then the remove button (trash) shows, in a column of its own right after "left".
- With no rule: "No rules: nothing turns yellow or red." in faint text.
