// Wallet MCP server. Exposes wallet operations as tools any MCP client (Claude
// Code, etc.) can call. Every tool drives the shared service layer, so behavior
// matches the web app exactly. Run: npx tsx mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as svc from "../src/service/index";

const server = new McpServer({ name: "solhakathon-wallet", version: "0.1.0" });
const ok = (d: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(d, null, 2) }] });

server.registerTool(
  "wallet_create",
  { description: "Provision this device's Solana devnet wallet (with a best-effort airdrop). Returns the public key." },
  async () => ok(await svc.createWallet()),
);

server.registerTool(
  "wallet_status",
  { description: "Read the wallet address and live devnet SOL balance." },
  async () => ok(await svc.getState()),
);

server.registerTool(
  "wallet_airdrop",
  { description: "Request a devnet SOL airdrop for the wallet (faucet is rate-limited)." },
  async () => ok(await svc.requestAirdrop()),
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
