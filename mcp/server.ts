// Wallet MCP server. Exposes wallet operations as tools any MCP client (Claude
// Code, etc.) can call. Every tool drives the shared service layer, so behavior
// matches the web app exactly. Run: npx tsx mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as svc from "../src/service/index";

const server = new McpServer({ name: "solhakathon-wallet", version: "0.1.0" });
const ok = (d: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(d, null, 2) }] });

// Optional per-call RPC override. Set SOLANA_RPC_URL so the shared getConnection
// picks it up; omitted => SOLANA_RPC_URL / the default endpoint.
const rpcUrlField = z
  .string()
  .url()
  .optional()
  .describe("RPC endpoint to use for this call. Overrides SOLANA_RPC_URL / the default.");
const useRpc = (rpcUrl?: string) => {
  if (rpcUrl) process.env.SOLANA_RPC_URL = rpcUrl;
};

const splitShape = {
  recipients: z
    .array(z.object({ address: z.string(), amount: z.number().positive() }))
    .min(1)
    .describe("Recipient wallet addresses + amounts in UI units (e.g. 1.5)."),
  mint: z
    .string()
    .optional()
    .describe("SPL token mint to split. Omit (or 'SOL') to split native SOL instead."),
  rpcUrl: rpcUrlField,
};

server.registerTool(
  "wallet_create",
  { description: "Provision this device's Solana devnet wallet. Returns the public key (unfunded)." },
  async () => ok(await svc.createWallet()),
);

server.registerTool(
  "wallet_status",
  {
    description: "Read the wallet address and live devnet SOL balance.",
    inputSchema: { rpcUrl: rpcUrlField },
  },
  async ({ rpcUrl }) => {
    useRpc(rpcUrl);
    return ok(await svc.getState());
  },
);

server.registerTool(
  "wallet_transfer",
  {
    description:
      "Transfer SOL or an SPL token (e.g. USDC) from this device's wallet to a single recipient on devnet. Omit `mint` (or pass 'SOL') for native SOL; pass 'USDC' or a mint address for a token. The recipient's token account is auto-created if missing.",
    inputSchema: {
      to: z.string().describe("Recipient's base58 Solana address"),
      amount: z.number().positive().describe("Amount to send, in UI units (e.g. 1.5)"),
      mint: z
        .string()
        .optional()
        .describe("Token to send: 'SOL' (default), 'USDC', or an SPL mint address."),
      rpcUrl: rpcUrlField,
    },
  },
  async ({ to, amount, mint, rpcUrl }) => {
    useRpc(rpcUrl);
    return ok(await svc.sendFunds(to, amount, mint));
  },
);

server.registerTool(
  "wallet_split",
  {
    description:
      "Multi-transfer from this wallet to many recipients in one transaction. Omit `mint` to split native SOL; pass an SPL mint to split that token (recipient ATAs are auto-created). Amounts are UI units.",
    inputSchema: splitShape,
  },
  async ({ recipients, mint, rpcUrl }) => {
    useRpc(rpcUrl);
    return ok(await svc.split(recipients, mint));
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
