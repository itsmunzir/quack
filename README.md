<p align="center">
  <img src="docs/brand/sticker-mono.svg" width="120" height="120" alt="Quack logo, a hand-drawn duck on a white tile">
</p>

<h1 align="center">Quack</h1>

<p align="center">A fast, good-looking, open source API client for the desktop. Send a request, see what comes back.</p>

> Early development. Environments and history are next.

## Download

Get the latest installer for Windows, macOS or Linux from [Releases](https://github.com/itsmunzir/quack/releases/latest).

Builds aren't code-signed yet. On Windows, SmartScreen may warn: choose "More info" → "Run anyway". On macOS, right-click Quack.app → Open the first time.

## Features

- Send any HTTP request and read the response, with JSON highlighting
- Spaces: up to nine collections of saved requests, each with its own colour, plus pinned favourites
- A command bar (`Ctrl+K`) to jump to any request or space and run actions
- Edit query params as rows, kept in sync with the URL
- Nine themes, light and dark: Paper, Field, Mochi, Midnight, Neon, Ember, Mocha, Rosé Pine and Black (`Ctrl+Shift+T` cycles them), with a gradient, tinted or plain background
- Cookies, redirects and gzip/brotli/zstd decoding handled for you
- Small and fast: a native app, not Electron

## Shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl+Enter` | Send |
| `Ctrl+K` | Command bar |
| `Ctrl+N` / `Ctrl+D` | New / duplicate request |
| `Ctrl+1`…`9` | Switch space |
| `Ctrl+Shift+T` | Next theme |

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

Themes live in `src/styles.css`, one self-contained block each. To add one, copy a block, give it a
new `data-theme` id and list it in `src/themes.ts`.

## Brand

Logo files live in [`docs/brand`](docs/brand):

- `sticker-mono.svg`: the app icon (black and white, hand-drawn outline)
- `sticker-dark.svg` and `sticker-yellow.svg`: alternates
- `duck.svg`: the hand-drawn line duck, for large sizes and the empty state

App icons are generated with `npm run tauri -- icon src-tauri/icons/source.svg`.

## License

[MIT](LICENSE)
