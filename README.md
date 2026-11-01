# Krishi Sahayak — Gemini-powered Android app

Krishi Sahayak is a mobile-first agricultural field-support app for farmers and extension workers in Maharashtra. It supports crop/problem questions, crop photographs, local field-visit records, GPS capture, CSV export, escalation notes, and a conversational Google Gemini assistant.

## New: Google Gemini + voice assistant

- Gemini-powered chat assistant with short conversational history during the current app session.
- Marathi, Hindi and English response selection; the assistant can understand mixed-language prompts.
- Crop photo diagnosis through Gemini image input in the existing crop-advice flow.
- Voice input through the Android WebView Web Speech API when supported by the device. If unavailable, use the microphone on the Android keyboard.
- Spoken answers through device text-to-speech when available, with per-answer replay and an on/off switch.
- Gemini API key stays on the server; it is never embedded in the APK.

## 1. Create a Google Gemini API key

1. Open [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Create an API key for your Google project.
3. Keep the key private. Do not paste it into `www/config.js`, the Android app, GitHub source files, or a public issue.

The server uses Google's Gemini REST `generateContent` endpoint. The default model is `gemini-2.5-flash`; you can override it with `GEMINI_MODEL` if your Google project has access to another supported model.

## 2. Deploy the secure API server

Deploy `server/server.js` to a Node.js 20+ host that provides HTTPS (for example, a Node hosting service). Set these environment variables in the hosting dashboard:

- `GEMINI_API_KEY` — your Google AI Studio API key (server only)
- `APP_KEY` — a long random pilot token, generated privately
- `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`
- `REQS_PER_HOUR` — optional per-IP rate limit; defaults to `60`
- `PORT` — optional; usually supplied by the hosting platform

The server exposes:

- `GET /health` — reports server readiness, provider and model (never exposes the API key)
- `POST /api/ask` — crop advice and photo-based questions
- `POST /api/chat` — multi-turn assistant conversation

After deployment, open `https://YOUR-API-HOST/health`. It should return `ok: true` and `configured: true`.

## 3. Connect the Android app to the server

Edit `www/config.js` before building the APK:

```js
window.KS_CONFIG = {
  apiUrl: "https://YOUR-API-HOST.example.com",
  appKey: "YOUR_LONG_RANDOM_PILOT_TOKEN"
};
```

The `APP_KEY` is extractable from an APK and is only a basic pilot gate, not production authentication. For a public release, implement real user authentication, per-user authorization, abuse controls and appropriate privacy notices. Do not distribute a public app relying solely on a shared token.

## 4. Build the Android APK using GitHub Actions

1. Create a new GitHub repository (for example `krishi-sahayak`).
2. Extract this ZIP and upload/push all project files to the repository root. Keep `.github/workflows/build-android.yml` in place.
3. Commit the configured `www/config.js` only if you accept that the pilot APP_KEY is visible in the app. Never put the Gemini API key there.
4. In GitHub, open **Actions → Build Krishi Sahayak Android APK → Run workflow**. Alternatively, push to `main` or `master`.
5. When the workflow completes successfully, open the run and download the `krishi-sahayak-debug-apk` artifact.
6. Extract the artifact ZIP and install `app-debug.apk` on an Android phone. You may need to allow installation from that source.

The workflow generates the Capacitor Android project, adds Internet, Camera, Location and Microphone permissions, syncs the web app and builds a debug APK. A signed Play Store release requires a private signing key and a release build configuration.

## 5. Local Android build

Requirements: Node.js 20+, JDK 17+, Android Studio and Android SDK.

```bash
npm install
npx cap add android       # first build only
npm run android:permissions
npx cap sync android
cd android
./gradlew assembleDebug  # Windows: gradlew.bat assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`.

## 6. Voice assistant notes

The app uses device speech recognition and text-to-speech APIs. Speech recognition support varies by Android version, WebView and installed speech services. If the in-app microphone is unavailable, tap the microphone on Gboard or the device keyboard to dictate into the message field. Spoken answers require a working Android text-to-speech engine and Marathi/Hindi/English voice data; install the relevant language voice data in Android settings if needed. This is a voice-enabled chat assistant, not a replacement for the system-level Google Assistant or Gemini app.

## 7. Safety and agronomy limitations

AI advice can be wrong. Verify diagnosis and all pesticide products, doses, registrations, pre-harvest intervals and safety instructions against current labels and local KVK/agricultural university recommendations. Escalate unusual symptoms, severe outbreaks, major losses, poisoning or human/livestock risks to a qualified local specialist. Weather, mandi prices and scheme eligibility are not live-connected in this version and should not be presented as real-time facts.

## Existing app features and limitations

- Field visits are stored locally on the phone; they are not synchronized or backed up automatically. Export CSV regularly.
- GPS is optional and requires location permission.
- Camera/photo access is optional and requires permission.
- The API has a basic per-IP rate limit. Add production-grade identity, logging, monitoring, data retention and abuse protection before public launch.
