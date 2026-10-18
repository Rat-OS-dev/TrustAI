# Trust AI Desktop

Trust AI Desktop is a lightweight Electron wrapper for the hosted Trust AI web application. It is designed to build installers for Windows and Linux while continuing to use the existing website, sign-in, backend, and billing controls.

## Development

Requirements: Node.js 22 or later.

```sh
npm install
npm start
```

## Build packages

Windows (64-bit):

```sh
npm run dist:win
```

Linux (AppImage and Debian package):

```sh
npm run dist:linux
```

Build output is written to `dist/`.

## Automated builds and releases

The GitHub Actions workflow `.github/workflows/desktop-release.yml` builds on Windows and Linux. Run it manually from the Actions tab to create test artifacts, or push a tag such as `desktop-v1.0.0` to build both platforms and create a **draft** GitHub Release. Review and test the files before publishing the release.

## Important notes

- The app requires internet access and opens the hosted Trust AI website.
- AI features may incur the same usage charges as the website.
- No provider API keys are bundled in this desktop app.
- Initial Windows installers are unsigned, so Windows SmartScreen may show a warning.
- Linux AppImage execution requirements vary by distribution.
- This is an initial desktop wrapper, not a fully offline application.
