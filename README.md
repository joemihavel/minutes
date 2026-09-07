# Minutes

Minutes records or uploads conversations, creates speaker-aware transcripts for Hindi, English, and Hinglish, produces structured summaries, and lets users ask questions across selected clips.

## Local development

Use Node.js 24 and install dependencies:

```bash
npm install
npm run dev
```

The app expects these services and environment variables:

- Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Neon Postgres: `DATABASE_URL`
- Vercel Blob: `BLOB_READ_WRITE_TOKEN`
- Upstash Redis: `KV_REST_API_URL`, `KV_REST_API_TOKEN`
- Provider-key encryption: `KEY_ENCRYPTION_SECRET`

Users connect their own Google AI or Groq key inside the app. Google AI powers preferred speaker-aware transcription; Groq provides fallback transcription and fast chat.

Run database migrations and the full quality suite with:

```bash
npm run db:migrate
npm run check
npm run build
```

## Production

The production project is deployed on Vercel at [tryminutes.vercel.app](https://tryminutes.vercel.app).
