# Contributing to Quack

Thanks for wanting to help. Bug reports, ideas and pull requests are all welcome.

## Before you start

For anything bigger than a small fix, please open an issue first so we can agree on the approach.
Quack tries to stay small and quiet, and some good ideas still won't fit. It's better to find that out
before you've written the code.

A few things Quack won't take on: accounts, cloud sync, telemetry, or anything that sends your data
somewhere you didn't send it yourself.

## Running it locally

You'll need Node 24+, stable Rust, and on Windows the WebView2 runtime.

```sh
git clone https://github.com/itsmunzir/quack
cd quack
npm install
npm start        # the app, with hot reload
```

## Before you open a pull request

```sh
npm run build                      # type-checks and builds the interface
cd src-tauri && cargo test         # Rust tests
cargo clippy --all-targets         # Rust lints
```

If you changed the interface, try it in light and dark mode, and in more than one theme.

## Style

- Keep changes focused: one fix or feature per pull request.
- Match the code around you. Comments explain why, not what.
- Text in the app is short and plain. Say what something does, not how clever it is.
- New colours must keep text at 4.5:1 contrast or better (WCAG AA) in light and dark.

## License

By contributing, you agree your work is released under the [MIT license](LICENSE).
