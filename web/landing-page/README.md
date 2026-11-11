# RESQ landing page

This is a static, dependency-free landing page. Open `index.html` directly in a browser to preview it. Its styles and interactive behavior are kept in `styles.css` and `script.js`. The `screenshots` folder contains the real app screens shown in the carousel, which loops automatically and pauses during interaction or when reduced motion is enabled.

## Enable APK downloads

After creating a public GitHub repository and publishing a GitHub Release with the APK asset named `RESQ.apk`, set `githubRepository` near the top of `script.js` to `owner/repository`:

```js
const githubRepository = "owner/ResQ";
```

The download button will then link to the latest release asset at `https://github.com/owner/ResQ/releases/latest/download/RESQ.apk`.

## Publish with GitHub Pages

Publish the contents of `web/landing-page` as the Pages site using a GitHub Actions workflow or a Pages deployment branch. The APK should be attached to a GitHub Release rather than committed to the website, so the repository history does not grow with each APK update.
