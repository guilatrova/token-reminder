# Design interview

## Context

Token Reminder shows how much of each AI plan is still unused and warns before a reset throws it away. It lives in
Orca's status bar and in a right-sidebar panel. Orca gives a plugin no popover, so the panel is where details and
settings live.

The first panels were drawn with Orca's declarative components. Gui's verdict on them: "mega feio, sem cor, morto",
"difícil até de entender", "parecendo markdown". His reference is Orca's own Usage list: "olha como é clean".

## Guiding mindset

- Clean like Orca's native Usage list, but alive: colour, bars, a sense of state at a glance.
- Understandable without reading: what is left, when it resets, whether that is a problem.
- Declarative components cannot do this (no colour on bars, no custom drawing), so the panel moves to an HTML page.

## Q1. Which visual direction for the panel?

Shown as one interactive prototype with a switcher, over the same accounts, with a "Today" and a simulated "Late
week" scenario, dark and light, and a working alert-rules editor behind the gear.

- **A · Pace**: one section per account. A large "% left", the time to reset, and a fuel-gauge bar: the fill is the
  plan left, a tick marks the time left in the window, and plan beyond the tick is hatched as "about to go unused".
  Reset credits are chips with their expiry.
- **B · Rings**: one tile per account with two concentric rings: thick is plan left, thin is time left.
- **C · Map**: one chart for every account, unused share against time to reset, with the alert rules drawn as yellow
  and red zones; below it, a timeline of every deadline, soonest first.

Proposals in the prototype that the product has not decided: the "time left" marker, the "~N% about to go unused"
figure (plan left minus time left), and the rules chart.

Answer: pending.
