# Release Guide

Use this guide when publishing a new version.

## 1. Update Version Numbers

Update the version in:

- `manifest.json`
- `package.json`

Use the same version in both files.

## 2. Build and Test

Run:

```bash
npm run build
npm test
npm run release
```

## 3. Check Release Files

Confirm this folder exists:

```text
dist/visual-media-layout
```

It should contain:

- `main.js`
- `manifest.json`
- `styles.css`
- `sha256sums.txt`

## 4. Create GitHub Release

1. Open the GitHub repository.
2. Create a new release with a tag like `0.1.0`.
3. Use the same version as `manifest.json`.
4. Attach these files:
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `sha256sums.txt`
5. Paste the user-facing release notes.

## 5. Share the Release Link

Use the GitHub Release URL as the only official download link.

Good places to share it:

- Project README
- Personal website
- Social posts
- Documentation

Do not publish alternate cloud drive links, reposted zip files, or chat-only attachments as official builds.
