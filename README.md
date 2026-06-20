# Solhakathon

Team base Next.js app. Shared, Vercel-ready foundation for the hackathon. Ships with **Solana devnet wallet creation** (one custodial wallet per browser, KV-backed) as the starting feature.

## Stack

- Next.js 16.2.9 (App Router, Turbopack)
- React 19
- TypeScript 5.9 (strict)
- ESLint 9 (flat config, `eslint-config-next/core-web-vitals`)
- `@solana/web3.js` (devnet) + `@vercel/kv` (with local filesystem fallback)
- Path alias `@/*` -> `src/*`
- Node.js >= 20.9 (see `.nvmrc`)

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

No env vars needed for local dev. Click **Create wallet** on the home page: it generates a Solana devnet keypair server-side, stores it under `data/kv/` (gitignored), and attempts a best-effort devnet airdrop.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run lint` | ESLint (`npm run lint:fix` to autofix) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run cli -- <cmd>` | Wallet CLI (`create` / `status` / `airdrop`) |
| `npm run mcp` | Start the wallet MCP server (stdio) |

## Project layout

```
src/app/                 pages + layouts (App Router)
src/app/api/health/      liveness probe
src/app/api/state/       current device state (wallet address + balance)
src/app/api/wallet/create/  provision a device wallet (POST)
src/components/          client UI (WalletCreator)
src/service/             shared service layer (web + CLI + MCP drive this)
src/lib/config.ts        network + constants
src/lib/types.ts         AppState shape
src/lib/kv/              KV persistence (Vercel KV or local file fallback)
src/lib/wallet/          encrypted per-device keypair custody
src/lib/state/           per-device state + distributed lock
src/lib/runtime/         AsyncLocalStorage request context
src/lib/solana/          devnet connection + wallet helpers
cli/wallet.ts            CLI entry (npm run cli)
mcp/server.ts            MCP stdio server (npm run mcp)
```

Import shared code via the `@/...` alias instead of long relative paths.

## CLI and MCP

The web app, the CLI, and the MCP server all call the same `src/service/` layer, so behavior is identical across them. The CLI and MCP run as a single local "device" (wallet keyed by `WALLET_DEVICE_ID`, default `local`).

```bash
npm run cli -- create     # provision the local wallet (+ best-effort airdrop)
npm run cli -- status     # wallet address + live SOL balance
npm run cli -- airdrop    # request a devnet airdrop
```

The MCP server (`npm run mcp`) exposes `wallet_create`, `wallet_status`, and `wallet_airdrop` over stdio. It is registered for Claude Code in `.mcp.json` (runs `npx tsx mcp/server.ts` from the project root), so any MCP client in this repo can call those tools.

## How wallet custody works

- Each browser gets a `gid` cookie = its device id. State + keypairs are keyed per device.
- Keypairs are stored as one bundle in KV under `keys:<deviceId>`. Secrets never leave the server.
- Reads (`/api/state`) never create a wallet; only `POST /api/wallet/create` provisions one, so a forged cookie can't fill KV.
- Per-device writes are serialized by an in-process mutex plus a cross-instance KV lock (`SET NX PX`), so concurrent requests can't lose updates on Vercel.

## Environment variables

Copy `.env.example` to `.env.local`. `.env*.local` is gitignored. Browser-exposed vars must start with `NEXT_PUBLIC_`. Mirror prod keys in the Vercel project settings.

| Var | When | Purpose |
|---|---|---|
| `SOLANA_RPC_URL` | optional | Override the devnet RPC endpoint |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | prod | Enable Vercel KV (else local file fallback) |
| `WALLET_MASTER_KEY` | prod (required with KV) | Encrypts wallet secrets at rest (AES-256-GCM) |

## Collaboration

- Branch off `main`, push your branch, open a PR. Keep `main` deployable.
- One feature per PR. Run `npm run typecheck` and `npm run lint` before pushing.
- Add new signing roles by extending `ACCOUNT_NAMES` in `src/lib/wallet/store.ts`.

## Deploy (Vercel)

Zero-config: import the repo in Vercel (auto-detects Next.js). Add a Vercel KV store and set `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and `WALLET_MASTER_KEY` in project env. Pushes to `main` ship to production; PRs get preview URLs. `/api/health` returns `{ status: "ok" }` to confirm a deploy is live.
