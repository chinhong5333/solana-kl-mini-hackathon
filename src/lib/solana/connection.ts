import { Connection } from "@solana/web3.js";
import { DEFAULT_RPC_URL } from "../config";

// Devnet connection. Override the endpoint with SOLANA_RPC_URL if set,
// otherwise fall back to DEFAULT_RPC_URL.
export function getConnection(): Connection {
  const endpoint = process.env.SOLANA_RPC_URL || DEFAULT_RPC_URL;
  return new Connection(endpoint, "confirmed");
}
