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

Answer: **A**. "A, mas quero também que seja collapsible e mais enxuto. Você precisa considerar os rate limit resets também."

Implies: one line per account that opens for detail; drop the big number and the chips; rate-limit resets are part of
the judgement, not a footnote. B and C are rejected.

## Q2. How should rate-limit resets count?

Shown on A, now one collapsible line per account (accounts that need spending start open), with a third simulated
scenario, "Reset expiring".

- Each unused reset is a small block after the account's bar and a deadline line in the detail.
- The same alert rules judge a reset: how close its expiry is, and how much of the current window is still unused
  (a reset cannot be cashed in while the plan is full). A reset that fires a rule colours the account.
- **Advice on / off**: with resets available, one line says what to do: "Use the 85% before Tue, Nov 24 and you can
  cash in a reset. That is about 14% a day."

Answer: accepted as shown, advice on. "Ok, to gostando..."

## Q3. Header and icon

Unprompted: "Só quero um header/icone melhor e menos genérico. Como o foco é token, usa algum icone bom de fato. E
tira o header, acho que ele vai ser inutil."

Implies: no headline at the top of the panel; refresh and settings move to a quiet footer. The bell is replaced.
Orca's icon list for the sidebar tab and the status bar has no token or coin, so `gauge` is the pick. Still open:
whether `gauge` is the icon he wants.

The rules chart from option C was never commented on, so it is not part of the direction.

## Q4. After using the built panel

Unprompted, on the panel running in Orca:

- "O state de loading tem que ser mais bonito... adiciona um skeleton." Done: placeholder rows.
- "Quero ícones reais das IAs, pega as mesmas do repo do orca." Done: the providers' own marks.
- "O status bar vai pra primeira linha, com gear/refresh na direita", "remover o updated just now", "remover barra
  divisória", "remover o underline no hover, melhor uma mudança da cor do bg." The footer became a toolbar on the
  first line; no "updated" text; no divider lines anywhere; hover is a background fill.
- The bar: "Tá confuso o jeito que você construiu a barra... Quero ver ainda quanto já foi usado e os trackers mostram
  o que ainda falta nos pontos." The first bar filled with what was left. It now fills with what was used, the tick
  marks the time gone, and the hatch between them is what should have been spent by now.
- "Essa barra pode ser mais slim, e no hover exibe o % e ela fica gorda." The bar is `4px` at rest; hovering
  thickens it to `14px` and shows the share used. The used/left caption under the bar is gone.
- "Tem como no footer ter um link pro meu github, mas bem pequenininho... tipo créditos: Who created this?" A tiny
  credit link under the list.
- "A % queria que fosse um tooltip e não texto dentro." The share used shows in a tooltip at the end of the fill.

## Q5. Settings, reloads and the status bar

Unprompted, on the panel running in Orca:

- "A tela do settings tá muito feia... vc caprichou bem na tela principal com efeitos, hover, icones pequenos, fonte
  limpa, etc, mas aqui em settings tá um nojo." The boxed, labelled selects are gone: each rule is a sentence of
  borderless selects with a colour dot, rows take the hover fill, add and remove are icon buttons.
- "É possivel cachear essa tela pra nao demorar tanto pra recarregar? ... ela pode atualizar alguns secs depois."
  The worker answers from its last read; the skeleton only shows when there is nothing recent to show.
- "Podemos adicionar uma config em settings pra hide a status bar no footer? ... (fica on by default)." A switch in
  Settings, on by default.
