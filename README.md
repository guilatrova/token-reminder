# Token Reminder

An [Orca](https://github.com/stablyai/orca) status bar item that shows how much of each AI plan is still unused and
warns before a reset throws it away.

Orca's own usage meter turns red when a plan is nearly spent. Token Reminder watches the opposite: a reset is close
and much of what you paid for is still there.

## What it does today

- Reads the Codex accounts Orca manages on this machine.
- Shows the most pressing plan window in the status bar: the share left and the time to its reset.
- Turns yellow or red from three built-in rules (reset within 2d with 50% left, 1d with 70%, 10h with 90%). Weekly
  and monthly windows are judged; the short session window is not.
- Lists every account, its windows and the rate-limit resets you can still redeem in the tooltip. Pressing the item
  reads again.
- Re-reads every 10 minutes.

It only reads. It never refreshes a login, writes a login file or redeems a reset.

## How it is built

The domain knows no provider. Each provider is one adapter behind a small port.

```
src/core/       usage.ts (types and the UsageSource port), alerts.ts (rules), report.ts (what is shown)
src/adapters/   codex.ts, memory.ts
src/status-bar.ts  what the status bar item says about a report
src/app.ts         what the worker does with its sources
src/worker.ts      composition root: reads the environment and picks the adapters
```

To add a provider, write `src/adapters/<provider>.ts` returning a `UsageSource` and add one line to `sources` in
`src/worker.ts`. A login that cannot be read comes back as `unavailable` with a reason; an unknown value is `null`,
never `0`.

## Develop

Needs Orca 1.4.248 or newer.

```sh
npm install
npm run types                 # writes Orca's typings to .orca/types
orca plugin dev watch .
npm run check                 # format, types, tests, manifest
```

`orca plugin dev watch` loads the folder into your Orca and reloads it on every save. The plugin runs a Node worker
with your user account's access, so Orca asks you to approve it once.
