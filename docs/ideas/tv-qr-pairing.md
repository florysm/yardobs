# Future project: QR-code pairing for the TV app

**Status:** idea, not started. Logged 2026-11-22.
**Today:** the TV is set up by sending a "Set up another device" link with `adb shell am start … --es url '…'` (see `tv/README.md`). It works, but it needs a computer with adb.

## Goal

Set up a TV (or any device without a keyboard) by scanning a QR code with a phone that already has YardObs set up. No adb, no typing.

## Why it needs a server

The phone can't hand the link to the TV directly: an `https://yardobs.app` page can't call a plain `http://` address on the home network (mixed content / Private Network Access), and the TV has no camera. So the two devices need a shared mailbox, and the API has no shared storage today (rate limits live in instance memory).

## Proposed flow

1. **TV:** on first launch with no station saved, show a pairing screen with a QR code for
   `https://yardobs.app/#pair=<id>.<secret>`
   - `id`: random, used as the mailbox name.
   - `secret`: random 256-bit key. It lives only in the fragment, which browsers never send to a server.
2. **Phone:** scanning opens YardObs, which asks "Send your station to this TV?" (size picker: Large / Normal / Detailed). On yes, it builds the usual setup payload, encrypts it with AES-GCM using `secret` (WebCrypto), and `POST`s only the ciphertext to `/api/pair?id=<id>`.
3. **Server:** stores the ciphertext under `id` with a 10-minute TTL, returns it once on `GET /api/pair?id=<id>`, then deletes it.
4. **TV:** polls `GET /api/pair?id=<id>` every ~3 s while the QR is shown, decrypts with `secret`, applies it like a setup link (`applyDeviceLink`), and switches to Dashboard mode.

The server only ever holds ciphertext it can't read, which keeps the README's promise about where the TWC key goes.

## Pieces

- Storage: a small KV with TTL, e.g. Upstash Redis via the Vercel Marketplace (free tier is plenty).
- `api/pair.js`: PUT/GET with TTL, single read, size cap, rate limit (reuse `api/lib/rateLimit.js`), and ids validated by shape.
- Web: a pairing screen (shown in place of `LocationSetup` when running as the TV app, i.e. the `YardObsTV` user agent, or behind `?pair=1`), a `#pair=` handler on the phone side, and AES-GCM helpers with tests.
- QR rendering: a small dependency-free encoder, or a tiny npm package.

## Open questions

- Also offer pairing from Settings on an already-set-up TV (to switch stations)?
- Show a short typed code under the QR as a fallback (like streaming-app sign-ins)?
- Should the TV app expose pairing natively instead, or keep it all in the web app? (Keeping it in the web app means no APK update.)
