# Rateio API Backend

MVP Backend for "Rateio Justo" - Bill Splitting App.

## Stack
- **Runtime**: Node.js (Vercel Functions)
- **Framework**: Hono
- **Database**: Turso (LibSQL) + Drizzle ORM
- **Auth**: Clerk (JWT)
- **Payments**: Mercado Pago (PIX)
- **Analytics**: Vercel Web Analytics

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```
   *(Note: Ensure you are in a Linux/WSL environment if on Windows to avoid path issues)*

2. **Environment Variables**
   Copy `.env.example` to `.env` and fill in credentials:
   - `TURSO_DATABASE_URL` & `TURSO_AUTH_TOKEN` (from Turso CLI)
   - `CLERK_SECRET_KEY` (from Clerk Dashboard)
   - `MERCADO_PAGO_ACCESS_TOKEN` (from Mercado Pago Developers)

3. **Database Migrations**
   Generate and push migrations to Turso:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

4. **Development**
   Start the dev server:
   ```bash
   npm run dev
   ```

## Testing
Run the calculation unit tests:
```bash
npx tsx test/calculation.test.ts
```

## API Routes

| Method | Path | Description | Access |
|Ordem|---|---|---|
| GET | `/health` | Health Check | Public |
| GET | `/pricing/current` | Get current platform fees | Public |
| POST | `/splits` | Create a new split (draft) | Auth |
| GET | `/splits/:id` | Get split details (owner) | Auth |
| PUT | `/splits/:id/participants` | Update participants | Auth |
| PUT | `/splits/:id/items` | Update items & shares | Auth |
| PUT | `/splits/:id/extras` | Update service fees/extras | Auth |
| POST | `/splits/:id/ai-parse` | Parse receipt text (stub) | Auth |
| POST | `/splits/:id/compute-review` | Calculate totals & freeze pricing | Auth |
| POST | `/splits/:id/pay` | Pay via Wallet or PIX | Auth |
| GET | `/public/:slug` | Read-only view of PAID split | Public |
| POST | `/webhooks/mercadopago` | Handle payment notifications | Public |
| GET | `/analytics/example` | Analytics integration example | Public |

## Analytics

This project includes Vercel Web Analytics integration for tracking HTML pages served by the API. See [docs/ANALYTICS.md](docs/ANALYTICS.md) for detailed setup and usage instructions.

## Deployment
This project is configured for Vercel.
1. Connect via Vercel CLI or Dashboard.
2. Set Environment Variables in Vercel.
3. Deploy.
