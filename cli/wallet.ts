// Wallet CLI. Drives the same shared service as the web app and the MCP server.
//
// Two modes:
//   one-shot     npm run cli -- <create|status|airdrop>
//   interactive  npm run cli            (prompt loop; type commands, "exit" to quit)
import * as readline from "node:readline";
import * as svc from "../src/service/index";

const out = (d: unknown) => console.log(typeof d === "string" ? d : JSON.stringify(d, null, 2));

const USAGE = `wallet commands:

  create     provision this device's devnet wallet (instant; unfunded)
  status     show wallet address + live SOL balance
  airdrop    request a devnet SOL airdrop (faucet is rate-limited)
  help       show this help
  exit       leave the interactive shell

  one-shot:      npm run cli -- create
  interactive:   npm run cli`;

async function run(cmd: string): Promise<void> {
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
  console.log('wallet shell. commands: create, status, airdrop, help, exit.');
  rl.prompt();
  for await (const line of rl) {
    const cmd = line.trim();
    if (cmd === "exit" || cmd === "quit") break;
    if (cmd) {
      try {
        await run(cmd);
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
      }
    }
    rl.prompt();
  }
  rl.close();
}

async function main() {
  const [cmd] = process.argv.slice(2);
  if (cmd) {
    await run(cmd);
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
