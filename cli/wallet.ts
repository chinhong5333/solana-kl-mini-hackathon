// Wallet CLI. Drives the same shared service as the web app and the MCP server.
//
// Two modes:
//   one-shot     npm run cli -- <create|status|transfer|split>
//   interactive  npm run cli            (prompt loop; type commands, "exit" to quit)
import * as readline from "node:readline";
import * as svc from "../src/service/index";

const out = (d: unknown) => console.log(typeof d === "string" ? d : JSON.stringify(d, null, 2));

const USAGE = `wallet commands:

  create                provision this device's devnet wallet (instant; unfunded)
  status                show wallet address + live SOL balance
  transfer <to> <amt> [token]  send SOL or a token to one recipient (token: SOL|USDC|<mint>)
  split                 multi-transfer SOL or an SPL token to many recipients in one tx
  help                  show this help
  exit                  leave the interactive shell

  split usage:
    split <addr>:<amount> [<addr>:<amount> ...]            # native SOL
    split --mint <MINT> <addr>:<amount> [<addr>:<amount> ] # SPL token
    amounts are in UI units (e.g. 1.5); SPL amounts scale by mint decimals

  one-shot:      npm run cli -- transfer <address> 0.1          # SOL
  one-shot:      npm run cli -- transfer <address> 1.5 USDC     # USDC (or a mint)
  one-shot:      npm run cli -- split <addr>:0.1 <addr>:0.2
  interactive:   npm run cli`;

// Parse "split" args: optional "--mint <addr>" then one or more "<addr>:<amount>".
function parseSplitArgs(args: string[]): { mint: string | null; recipients: { address: string; amount: number }[] } {
  let mint: string | null = null;
  const recipients: { address: string; amount: number }[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mint") {
      mint = args[++i] ?? null;
      if (!mint) throw new Error("--mint requires a mint address");
      continue;
    }
    const idx = args[i].lastIndexOf(":");
    if (idx <= 0) throw new Error(`bad recipient "${args[i]}"; expected <addr>:<amount>`);
    const address = args[i].slice(0, idx);
    const amount = Number(args[i].slice(idx + 1));
    if (!Number.isFinite(amount)) throw new Error(`bad amount in "${args[i]}"`);
    recipients.push({ address, amount });
  }
  if (recipients.length === 0) throw new Error("split needs at least one <addr>:<amount>");
  return { mint, recipients };
}

async function run(cmd: string, args: string[] = []): Promise<void> {
  switch (cmd) {
    case "create":
      out(await svc.createWallet());
      break;
    case "status": {
      const s = await svc.getState();
      out({ network: s.network, wallet: s.wallet.publicKey, solBalance: s.wallet.solBalance });
      break;
    }
    case "transfer": {
      const [to, amount, token] = args;
      if (!to || !amount) {
        console.log("usage: transfer <recipient-address> <amount> [SOL|USDC|<mint>]");
        break;
      }
      out(await svc.sendFunds(to, Number(amount), token));
      break;
    }
    case "split": {
      const { mint, recipients } = parseSplitArgs(args);
      out(await svc.split(recipients, mint));
      break;
    }
    case "help":
    case "":
      console.log(USAGE);
      break;
    default:
      console.log(`unknown command: ${cmd}`);
      console.log(USAGE);
  }
}

// Interactive shell: read a command per line until "exit"/"quit" or EOF.
async function repl(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "wallet> " });
  console.log('wallet shell. commands: create, status, transfer, split, help, exit.');
  rl.prompt();
  for await (const line of rl) {
    const [cmd, ...args] = line.trim().split(/\s+/);
    if (cmd === "exit" || cmd === "quit") break;
    if (cmd) {
      try {
        await run(cmd, args);
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
      }
    }
    rl.prompt();
  }
  rl.close();
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd) {
    await run(cmd, args);
  } else {
    await repl();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
