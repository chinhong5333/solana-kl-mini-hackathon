import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { withForcedDevice } from "@/lib/state/lock";
import { createWallet, getState, split } from "@/service";

export const runtime = "nodejs";
// Tools hit devnet (transfer/split confirm); raise above Vercel's 10s default.
export const maxDuration = 60;

// HTTP MCP carries no `gid` cookie, so it can't ride the per-browser device.
// Run every tool as one fixed, trusted server-side device (override the cookie
// resolution), provisioned on first use. Configure with MCP_DEVICE_ID.
const MCP_DEVICE = process.env.MCP_DEVICE_ID || "mcp";
const asDevice = <T>(fn: () => Promise<T>) => withForcedDevice(MCP_DEVICE, true, fn);
const text = (d: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(d, null, 2) }] });

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "wallet_create",
      "Provision this device's Solana devnet wallet. Returns the public key (unfunded).",
      {},
      async () => text(await asDevice(createWallet)),
    );
    server.tool(
      "wallet_status",
      "Read the wallet address and live devnet SOL balance.",
      {},
      async () => text(await asDevice(getState)),
    );
    server.tool(
      "wallet_split",
      "Multi-transfer from this wallet to many recipients in one transaction. Omit `mint` to split native SOL; pass an SPL mint to split that token (recipient ATAs are auto-created). Amounts are UI units.",
      {
        recipients: z.array(z.object({ address: z.string(), amount: z.number().positive() })).min(1),
        mint: z.string().optional(),
      },
      async ({ recipients, mint }) => text(await asDevice(() => split(recipients, mint))),
    );
  },
  {},
  { basePath: "/api" },
);

export { handler as GET, handler as POST, handler as DELETE };
