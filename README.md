# Verdict

Share any product to Verdict and get an evidence-backed **BUY / SKIP / DEPENDS** in the
background. No scores and no price tracking: just what owners and reviewers actually say, with
sources.

1. In any app (Amazon, Flipkart, Chrome, Instagram…), tap **Share → Verdict**.
2. A small "Added to Verdict · Investigating…" confirmation shows, then you're back where you were.
3. Verdict reads the screenshot/link/text, identifies the product and researches it.
4. A push notification arrives. Tap it to open the full verdict.

The app itself is just the inbox: everything you've shared, its state
(identifying · researching · ready · needs input · failed) and the verdict.

## Stack

- **App:** Expo SDK 57 / React Native, expo-router, expo-share-intent, expo-notifications.
  No custom native modules.
- **API + worker:** Fastify on AWS Lambda (Function URL) + a worker Lambda invoked async.
- **Storage:** Postgres on RDS (main DB and report cache), S3 for screenshots.
- **OCR:** Amazon Textract. **Push:** Expo Push. **Auth:** Supabase (sign-in only).
- **Region:** everything in AWS Mumbai (ap-south-1).

## Live

API: `https://en2dt3moxtzkwjbfpr7v7zgtti0ynhkw.lambda-url.ap-south-1.on.aws`

## Database

Schema changes: `cd server && npm run db:generate && npm run db:migrate`.

## Run locally

```bash
cd server && cp .env.example .env && npm install && npm run db:migrate && npm run dev   # :8787
cd app && cp .env.example .env && npm install && npx expo run:android
```

Without `WORKER_FUNCTION_NAME` the server processes shares in-process, so no AWS is needed
for local dev except S3/Textract for screenshots.

Dev builds prefill sign-in with a demo account when `EXPO_PUBLIC_DEMO_EMAIL` and
`EXPO_PUBLIC_DEMO_PASSWORD` are set in `app/.env`.

### Building the APK on Windows

CMake hits the 260-char path limit. Generate codegen from the real path, then build from a short
drive letter:

```powershell
cd app; npx expo prebuild --platform android --clean
cd android; .\gradlew generateCodegenArtifactsFromSchema
subst V: C:\path\to\Verdict; cd V:\app\android
.\gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a
subst V: /d
```

## Tests

```bash
npm run typecheck && npm test   # from the repo root: server + app
```
