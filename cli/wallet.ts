// Wallet CLI. Drives the same shared service as the web app and the MCP server.
// Run: npx tsx cli/wallet.ts <command>   (or: npm run cli -- <command>)
import * as svc from "../src/service/index";

const out = (d: unknown) => console.log(typeof d === "string" ? d : JSON.stringify(d, null, 2));

const USAGE = `wallet <command>

  create     provision this device's devnet wallet (+ best-effort airdrop)
  status     show wallet address + live SOL balance
  airdrop    request a devnet SOL airdrop (faucet is rate-limited)`;

async function main() {
  const [cmd] = process.argv.slice(2);
  switch (cmd) {
    case "create":
      out(await svc.createWallet());
      break;
    case "status": {
      const s = await svc.getState();
      out({ network: s.network, wallet: s.wallet.publicKey, solBalance: s.wallet.solBalance });
      break;
    }
    case "airdrop":
      out(await svc.requestAirdrop());
      break;
    default:
      console.log(USAGE);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
