// Builds a page that runs the real panel against test/preview/scenarios.ts, outside Orca:
//   npm run preview   then open .orca/preview/index.html?scenario=late-week&theme=dark
import { build } from 'esbuild'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'

const out = '.orca/preview'
// One self-contained page: a browser will not load module files from disk.
const bundle = await build({
  entryPoints: ['test/preview/entry.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'warning',
})
const script = bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')
const css = await readFile('src/panel/panel.css', 'utf8')

// Stand-ins for the theme variables Orca gives a panel, close to its default dark and light themes.
const THEME = `
  html.dark { --orca-background:#2e3440; --orca-foreground:#e5e9f0; --orca-card:#3b4252; --orca-card-foreground:#e5e9f0;
    --orca-popover:#3b4252; --orca-popover-foreground:#e5e9f0; --orca-primary:#e5e9f0; --orca-primary-foreground:#2e3440;
    --orca-secondary:#3b4252; --orca-secondary-foreground:#e5e9f0; --orca-muted:#3b4252; --orca-muted-foreground:#9aa5b8;
    --orca-accent:#434c5e; --orca-accent-foreground:#eceff4; --orca-destructive:#f87171; --orca-destructive-foreground:#fff;
    --orca-border:#434c5e; --orca-input:#4c566a; --orca-ring:#88c0d0; --orca-radius:8px; }
  html.light { --orca-background:#ffffff; --orca-foreground:#1b1f28; --orca-card:#f6f7f9; --orca-card-foreground:#1b1f28;
    --orca-popover:#ffffff; --orca-popover-foreground:#1b1f28; --orca-primary:#1b1f28; --orca-primary-foreground:#fff;
    --orca-secondary:#f1f2f5; --orca-secondary-foreground:#1b1f28; --orca-muted:#f1f2f5; --orca-muted-foreground:#667085;
    --orca-accent:#eceef2; --orca-accent-foreground:#1b1f28; --orca-destructive:#dc2626; --orca-destructive-foreground:#fff;
    --orca-border:#e1e4ea; --orca-input:#d5d9e0; --orca-ring:#2563eb; --orca-radius:8px; }`

await mkdir(out, { recursive: true })
await copyFile('src/panel/tibo.jpg', `${out}/tibo.jpg`)
await writeFile(
  `${out}/index.html`,
  `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>${THEME}</style>
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">${script}</script>
  </body>
</html>
`,
)
console.log(`Preview built: ${out}/index.html?scenario=<name>&theme=dark|light`)
