# Changelog

## 0.1.3 · 2026-11-09

- **Request chaining.** Capture a value from a response, by JSON path or header, into an environment
  variable that other requests can use as `{{name}}`.
- **Response viewer.** Fold JSON, search the body (`Ctrl+F`), filter with a `$.path`, click a key to copy its
  path, switch to Raw, and see image responses as images.
- **Copy as code.** Any request as cURL, JavaScript `fetch`, Python `requests`, Go `net/http` or HTTPie.
- **`.http` import** from VS Code REST Client and JetBrains, with file variables and response references.
- **Ink** is the new default theme.
- Every text colour now meets WCAG AA contrast in all themes, light and dark.
- Tidier corner radii, and buttons that respond when pressed.

## 0.1.2 · 2026-11-09

- **Folder sync.** Save a space as a folder of YAML files you can commit to git. Edits save as you go, and
  changes from a `git pull` appear when you switch back. Secrets stay in a gitignored `local.yaml`.
- Import collections and OpenAPI specs written in YAML.

## 0.1.1 · 2026-11-08

- Import Postman collections and OpenAPI 3 or Swagger 2 specs. Export and back up spaces.
- Environments with `{{variables}}`.
- Bearer, Basic and API key auth.
- URL-encoded forms and multipart bodies with file uploads.
- Paste a cURL command to make a request, and copy any request back out as cURL.
- History of sent requests per space.
- Cancel a request mid-flight.
- Four themes, each in light and dark.

## 0.1.0 · 2026-11-08

- First release.
