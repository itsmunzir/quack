<p align="center">
  <img src="docs/brand/sticker-mono.svg" width="120" height="120" alt="Quack logo, a hand-drawn duck on a white tile">
</p>

<h1 align="center">Quack</h1>

<p align="center">A fast, good-looking, open source API client for the desktop. Send a request, see what comes back.</p>

> Early development.

## Download

Get the latest installer for Windows, macOS or Linux from [Releases](https://github.com/itsmunzir/quack/releases/latest).

Builds aren't code-signed yet. On Windows, SmartScreen may warn: choose "More info" → "Run anyway". On macOS, right-click Quack.app → Open the first time.

## Features

- Send any HTTP request and read the response, with JSON highlighting
- Spaces: up to nine collections of saved requests, each wearing its own theme, plus pinned favourites
- A command bar (`Ctrl+K`) to jump to any request or space and run actions
- Edit query params as rows, kept in sync with the URL
- History per space: every send with its response, one click to see it again (`Ctrl+H`)
- Import Postman collections and OpenAPI or Swagger specs (JSON or YAML); export a space or back up everything
- Bodies: raw, URL-encoded form, or multipart with file uploads
- Auth: Bearer, Basic or API key (header or query), with variables for secrets
- Environments per space: `{{variables}}` in URLs, headers and bodies, switched with `Ctrl+E`
- Paste a cURL command into the URL bar to import it; copy any request back out as cURL
- Four themes, Honey, Sage, Periwinkle and Ink (square and technical), each in light and dark (or following your system), with an optional accent glow (`Ctrl+Shift+T` cycles themes)
- Cookies, redirects and gzip/brotli/zstd decoding handled for you
- Small and fast: a native app, not Electron

## Shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl+Enter` | Send, or cancel while sending |
| `Ctrl+K` | Command bar |
| `Ctrl+N` / `Ctrl+D` | New / duplicate request |
| `Ctrl+1`…`9` | Switch space |
| `Ctrl+E` | Next environment |
| `Ctrl+H` | Show history |
| `Ctrl+Shift+T` | Next theme for this space |

## Stack

- **App shell:** [Tauri 2](https://tauri.app) (Rust)
- **UI:** React 19, TypeScript, Tailwind CSS 4, Vite
- **Engine:** [reqwest](https://github.com/seanmonstar/reqwest) (`src-tauri/src/engine.rs`)

## Develop

Requirements: Node 24+, Rust (stable), and on Windows the WebView2 runtime.

```sh
npm install
npm start        # runs the app with hot reload
```

Themes live in `src/styles.css`. A theme is just an accent colour; light and dark surfaces come from the
mode and pick up a faint wash of the accent. To add one, add a `data-theme` block with `--accent` and
`--accent-fg`, then list it in `src/themes.ts`.

## Brand

Logo files live in [`docs/brand`](docs/brand):

- `sticker-mono.svg`: the app icon (black and white, hand-drawn outline)
- `sticker-dark.svg` and `sticker-yellow.svg`: alternates
- `duck.svg`: the hand-drawn line duck, for large sizes and the empty state

App icons are generated with `npm run tauri -- icon src-tauri/icons/source.svg`.

## License

[MIT](LICENSE)
