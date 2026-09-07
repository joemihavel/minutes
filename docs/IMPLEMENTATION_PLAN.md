# Minutes implementation plan

## Product boundary

Minutes is a free, multilingual audio workspace for Hindi, English, and Hinglish. Users authenticate, connect their own AI provider credentials, upload private audio, edit transcripts, ask transcript-grounded questions, inspect usage, and create revocable public transcript links. The platform never falls back to an operator-owned AI key.

## Architecture

- Next.js 16 App Router with Server Components by default and small client islands for the workspace.
- Clerk for managed authentication and session security.
- Neon Postgres with Drizzle for clips, transcripts, conversations, encrypted provider connections, shares, and usage events.
- Private Vercel Blob for audio. Audio is served only through ownership-checked route handlers or an explicitly audio-enabled share.
- Upstash Redis for distributed per-user and per-IP rate limits.
- AI SDK 7 with per-user Groq or Google provider instances created server-side from decrypted credentials.
- AES-256-GCM application-level encryption with random IVs, authenticated tags, and a versioned Vercel Secret.

## Security gates

- Authenticate and authorize inside every mutation and route handler; never rely only on proxy protection.
- Centralize database access in `server-only` modules returning minimal DTOs.
- Validate every request with Zod and cap body, filename, transcript, message, and audio sizes.
- Permit only known audio MIME types/extensions and store randomized private paths.
- Never return provider keys to the browser or log request bodies, transcripts, keys, or Blob tokens.
- Use constant-time-safe authenticated encryption, generic upstream errors, distributed rate limits, and no AI-key fallback.
- Default public shares to transcript-only, unlisted, `noindex`, revocable, and optionally expiring.
- Apply restrictive browser security headers and same-origin audio delivery.

## Performance gates

- Fetch independent server data in parallel and avoid Server Component to Route Handler waterfalls.
- Keep provider/database/blob SDKs server-only and remove the previous WebGL bundle.
- Stream chat responses, throttle UI stream updates, and limit conversation context.
- Use optimistic title/transcript updates with rollback and non-blocking React transitions.
- Contain long clip/transcript lists, animate only opacity/transform, and honor reduced motion.
- Co-locate database, Blob, and functions in US East for the initial deployment.

## Reference lock and decision ledger

| Decision | Source | Preserved role | Reason |
| --- | --- | --- | --- |
| Three-pane desktop workspace | User-provided ChatGPT screenshot | Navigation / document / contextual assistant | Keeps clip selection, transcript work, and questions visible together. |
| White fog surfaces, hairline borders, restrained shadow | ChatGPT reference | Main workspace surfaces | Calm, legible, and content-first. |
| Compact monochrome controls | Cal.com patterns | Secondary actions and settings | High information density without visual noise. |
| Flexible center with fixed contextual rail | Spyglass and Copy.ai patterns | Reading and assistant layout | Prioritizes the transcript while keeping chat stable. |
| Teal accent | User brief and existing product identity | Recording, active state, progress only | Makes system status memorable without turning the UI decorative. |
| Responsive panel tabs | Product constraint | Mobile navigation | Preserves the three mental models without squeezing three columns. |

## Delivery sequence

1. Infrastructure and encrypted secrets.
2. Schema, migration, DAL, validation, rate limiting, and provider adapters.
3. Authentication and onboarding.
4. Clip upload/transcription, transcript editing, delete, and private playback.
5. Streaming transcript chat and persisted conversations.
6. Usage dashboard and public sharing.
7. Accessibility, responsive behavior, error boundaries, tests, visual QA, and production deployment.
