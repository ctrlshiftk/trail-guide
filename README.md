# Trail Guide

Describe a problem and get curated web resources—docs, papers, tutorials, and data—matched to your situation. Refine the trail with follow-up questions, check your approach, filter by resource type, and save helpful links for later.

## ⚠️ API Key / mock mode

Search uses Google Generative AI (Gemini). Create or edit `.env.local` in the project root.

### UI work without using quota

Set mock mode so `/api/search` returns fixtures and never calls Gemini:

```bash
AI_MOCK=1
```

Restart `npm run dev` after changing env. With mock mode on, no API key is required.

Useful mock queries (type as the problem text):

- `mock:empty` — no results
- `mock:quota` — quota error UI
- `mock:error` — generic search error

In “check my approach”, include `correct` or `wrong` to switch the validation banner.

### Real Gemini search

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your-key-here
# leave AI_MOCK unset or set to 0
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey). Update `.env.local` and restart the dev server.

## Getting Started

To run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.