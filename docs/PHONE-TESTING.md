# Phone verification

## Current evidence

Desktop browser tests and responsive screenshots are local browser evidence. No actual iPhone or Android device has been exercised by this session. Native iOS/Android apps are not part of this web change.

The current LAN URL is http://192.168.100.213:3318. Phone and Mac must share the same network. This address can change when Wi-Fi reconnects. Plain HTTP supports ordinary web browsing but cannot provide browser microphone access on a phone; recording also offers an audio-file upload path where supported.

## Secure microphone testing

The web recorder requires a secure context, microphone permission, and supported MediaRecorder APIs. `localhost` is considered secure on the Mac; the Mac's plain HTTP LAN address is not a secure context on a phone.

A local HTTPS proxy is available with `npm run phone:https`. It forwards only to the existing web server on loopback port 3318, including streaming audio uploads. It requires an existing certificate whose subject alternative names cover the address used by the phone and whose issuer the phone trusts. Set `ORDO_TLS_KEY` and `ORDO_TLS_CERT` privately in root `.env` to those files. `ORDO_HTTPS_PORT` defaults to 3443.

Add the exact HTTPS browser origin to `TRUSTED_ORIGINS` alongside the localhost origins and restart the API. With the current IP/default HTTPS port this origin is `https://192.168.100.213:3443`. Start the web server, API, and then the HTTPS proxy. Open that HTTPS address on the phone. Do not bypass certificate warnings. This project does not automatically install a certificate authority or change device trust settings.

No phone-trusted certificate was provided or installed by this session, so local phone HTTPS remains unverified. A future hosted HTTPS environment can serve the same purpose after deployment is approved.

## Device checklist

Record device model, OS/browser version, date, URL, and result for each step. Use a disposable account and test audio. Do not include contact details, OTP values, session cookies, or private audio in screenshots.

| Check | iPhone Safari | Android Chrome |
|---|---|---|
| Email OTP request, paste/autofill code, sign in | Unverified | Unverified |
| Ghana phone OTP request and sign in | Unverified | Unverified |
| Wrong/expired code and resend handling | Unverified | Unverified |
| Sign out, reload, and sign back in | Unverified | Unverified |
| Search owner-scoped tasks, notes, and projects | Unverified | Unverified |
| Light, Dark, and System appearance | Unverified | Unverified |
| Task/note capture with software keyboard open | Unverified | Unverified |
| Allow microphone, start, stop, play back, save | Unverified | Unverified |
| Deny microphone and use available fallback | Unverified | Unverified |
| Upload supported audio file, retry network failure | Unverified | Unverified |
| Transcribe only when provider is configured | Unverified | Unverified |
| Background/lock device and return without a false success | Unverified | Unverified |
| Navigate away and confirm microphone indicator stops | Unverified | Unverified |
| Unsupported features say Coming soon | Unverified | Unverified |

SMS and email delivery use the configured Gatekeeper account. Actual delivery tests require an intended test recipient; no unsolicited OTP is sent as part of automated verification. The optional app-unlock PIN is not implemented. OTP itself is six digits; it is not a reusable PIN.
