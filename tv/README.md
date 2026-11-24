# YardObs on Google TV / Android TV

A small Android TV app that opens [yardobs.app](https://yardobs.app) full screen in Dashboard mode and keeps the TV awake. All the weather UI is the web app; this is only a wrapper (`tv/android`, one Java file), so every deploy to the site shows up on the TV without reinstalling.

## Get the APK

Every push that touches `tv/` builds it: **Actions → TV app (APK) → latest run → Artifacts → yardobs-tv** (a zip with `yardobs-tv-<version>.apk`). You can also start a build by hand from that page with **Run workflow**.

## One-time TV setup

1. On the TV: **Settings → System → About**, then press OK on **Android TV OS build** 7 times until it says you're a developer.
2. **Settings → System → Developer options**: turn on **USB debugging** (on some Hisense models it's called **Network debugging** or **ADB debugging**).
3. Find the TV's IP address under **Settings → Network & Internet → (your Wi-Fi)**.
4. On your computer (`brew install android-platform-tools` on a Mac):

   ```sh
   adb connect 192.168.1.50:5555      # the TV's IP; accept the prompt on the TV
   adb install -r yardobs-tv-1.15.1.apk
   ```

## Point it at your station

The easiest way is a **Set up another device** link (Settings → Set up another device on your phone, with "Open as a dashboard" on). Copy the link and send it to the TV, adding the size you want:

```sh
adb shell am start -n app.yardobs.tv/.MainActivity \
  --es url 'https://yardobs.app/?dashboard=large#setup=PASTE_THE_CODE'
```

Keep the single quotes; the `#` and `&` in the link would otherwise be eaten by the shell. Sizes: `large` (across the room — the usual TV pick), `normal`, `detailed`, `auto`.

The link is used once. After that the app opens `https://yardobs.app/` and the web app remembers your station, key and size. To change the size later, run the same command with just `--es url 'https://yardobs.app/?dashboard=detailed'`.

Without a link, launching the app shows the normal YardObs setup screen, which you can fill in with the remote and on-screen keyboard.

QR-code pairing (scan with your phone, no adb) is logged as a future project in [docs/ideas/tv-qr-pairing.md](../docs/ideas/tv-qr-pairing.md).

## Updating

Install a newer APK over the old one with `adb install -r …`. The app is always signed with the same debug key (`tv/android/app/yardobs-tv-debug.keystore`), so updates keep your saved station and key. If you ever change that key, uninstall first (`adb uninstall app.yardobs.tv`) and set it up again.

## Notes

- The app keeps the screen on while it's open; the TV's own sleep timer (Settings → System → Power & Energy) can still turn the TV off.
- If the network isn't up when it starts (e.g. right after the TV wakes), it retries every 30 seconds.
- The web app's nightly 3am reload and stale-data warning work here the same as on a tablet.
- Back on the remote leaves the app.
