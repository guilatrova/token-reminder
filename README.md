# Token Reminder

An [Orca](https://github.com/stablyai/orca) plugin that shows how much of each AI plan is still unused and warns
before a reset throws it away.

Orca's own usage meter turns red when a plan is nearly spent. Token Reminder watches the opposite: a reset is close
and much of what you paid for is still there.

## What it does today

- Reads your Claude, Codex and Grok plans from the logins already on this machine.
- **Status bar:** the most pressing plan window, with the share left and the time to its reset. Pressing it toggles
  the right sidebar, where the panel lives.
- **Panel:** for each account, every plan window and every rate-limit reset you can still redeem, with the date it
  ends and the time left.
- Turns yellow or red from your alert rules (built in: reset within 2d with 50% left, 1d with 70%, 10h with 90%).
  Weekly and monthly windows are judged; the short session window is not.
- **Settings** (the gear): edit the alert rules, and hide the status bar item.
- Re-reads every 10 minutes while the status bar item shows. Opening the panel shows the last read at once and only
  asks the providers again when that read is over 2 minutes old.

## What it reads and where it sends it

The plugin has no server and no telemetry. It reads three logins that other tools saved on your machine, and sends
each one only to its own provider's usage endpoint, to ask how much of the plan is used:

| Provider | Login it reads                                                                                           | Sent to                   |
| -------- | -------------------------------------------------------------------------------------------------------- | ------------------------- |
| Codex    | The accounts Orca manages: `<orca data>/codex-accounts/*/home/auth.json`                                 | `chatgpt.com`             |
| Claude   | Claude Code's login: the macOS Keychain item `Claude Code-credentials`, or `~/.claude/.credentials.json` | `api.anthropic.com`       |
| Grok     | The Grok CLI's login: `~/.grok/auth.json`                                                                | `cli-chat-proxy.grok.com` |

It only reads. It never refreshes a login, writes a login file or redeems a reset. Your alert rules and preferences
are kept in the plugin's own storage in Orca. Claude's model-specific weekly limit is not shown yet.

## How it is built

The domain knows no provider. Each provider is one adapter behind a small port.

```
src/core/       usage.ts (types and the UsageSource port), alerts.ts (rules), report.ts (what is shown)
src/adapters/   claude.ts, codex.ts, grok.ts, memory.ts
src/status-bar.ts  what the status bar item says about a report
src/app.ts         what the worker does with its sources
src/preferences.ts what the person chose about the plugin itself
src/worker.ts      composition root: reads the environment and picks the adapters
src/panel/          the sidebar panel: an HTML page that draws the report
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
npm run preview               # the panel against test/preview/scenarios.ts, outside Orca
```

`orca plugin dev watch` loads the folder into your Orca and reloads it on every save. The plugin runs a Node worker
with your user account's access, so Orca asks you to approve it once.

## Credits

The provider marks in the panel are the ones [Orca](https://github.com/stablyai/orca) (MIT) draws in its usage meter.
They belong to their owners and are used only to name the provider.
