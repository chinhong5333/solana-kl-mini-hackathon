import { createMcpHandler } from "mcp-handler";
import { withForcedDevice } from "@/lib/state/lock";
import { createWallet, getState, requestAirdrop } from "@/service";

export const runtime = "nodejs";
// Tools hit devnet (airdrop/confirm); raise above Vercel's 10s default.
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
      "Provision this device's Solana devnet wallet (with a best-effort airdrop). Returns the public key.",
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
      "wallet_airdrop",
      "Request a devnet SOL airdrop for the wallet (faucet is rate-limited).",
      {},
      async () => text(await asDevice(requestAirdrop)),
    );
  },
  {},
  { basePath: "/api" },
);

export { handler as GET, handler as POST, handler as DELETE };
