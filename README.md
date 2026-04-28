This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

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

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## AHackaday v1 API

Read-only endpoints are available under `/api/v1`:

- `GET /api/v1/incidents`
- `GET /api/v1/incidents/[slug]`
- `GET /api/v1/stats`
- `GET /api/v1/health`

### Incidents query params

- `severity`: `critical|high|medium|low|all`
- `category`: `zero-day|supply-chain|breach|ransomware|identity|cloud|web|email|critical-infrastructure|exploitation|consumer-security|other|all`
- `window`: `7d|30d|90d|all`
- `q`: free text query
- `limit`: max 100 (default 25)
- `cursor`: opaque pagination cursor from previous response

### Demo curl flow

```bash
curl "https://ahackaday-intel.vercel.app/api/v1/incidents?severity=critical&window=all&limit=5"
curl "https://ahackaday-intel.vercel.app/api/v1/incidents/<slug-from-first-call>"
curl "https://ahackaday-intel.vercel.app/api/v1/stats"
curl "https://ahackaday-intel.vercel.app/api/v1/health"
```
