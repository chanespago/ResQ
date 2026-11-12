# ResQ landing page

This is a static, dependency-free landing page. Open `index.html` directly in a browser to preview it. Its styles and interactive behavior are kept in `styles.css` and `script.js`. The `screenshots` folder contains the real app screens shown in the carousel, which loops automatically and pauses during interaction or when reduced motion is enabled.

## Enable APK downloads

The landing page download button links to the APK asset in the latest public GitHub Release. Keep `githubRepository` and `apkFileName` near the top of `script.js` in sync with the repository and the exact asset filename:

```js
const githubRepository = "owner/ResQ";
const apkFileName = "ResQ.apk";
```

The download button links to `https://github.com/owner/ResQ/releases/latest/download/ResQ.apk`. If you change the APK asset name in a release, update `apkFileName` to match.

## Publish with GitHub Pages

Publish the contents of `web/landing-page` as the Pages site using a GitHub Actions workflow or a Pages deployment branch. The APK should be attached to a GitHub Release rather than committed to the website, so the repository history does not grow with each APK update.
