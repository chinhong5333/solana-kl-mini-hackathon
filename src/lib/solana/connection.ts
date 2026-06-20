import { Connection, clusterApiUrl } from "@solana/web3.js";

// Devnet connection. Override the endpoint with SOLANA_RPC_URL if set.
export function getConnection(): Connection {
  const endpoint = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
  return new Connection(endpoint, "confirmed");
}
