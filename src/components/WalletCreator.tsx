"use client";

import { useCallback, useEffect, useState } from "react";

type TokenBalance = { mint: string; amount: number; decimals: number };
type AppState = { wallet: { publicKey: string; solBalance: number; tokens?: TokenBalance[] } };

export default function WalletCreator({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [publicKey, setPublicKey] = useState("");
  const [balance, setBalance] = useState(0);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  // quiet=true for background refreshes (mount, post-split): no spinner/error UI.
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setNote("");
    }
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      const s: AppState = await r.json();
      setPublicKey(s.wallet.publicKey);
      setBalance(s.wallet.solBalance);
      setTokens(s.wallet.tokens ?? []);
    } catch {
      if (!quiet) setNote("Could not refresh balance (RPC error). Try again.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  // Initial load, and re-fetch whenever a split bumps refreshSignal.
  useEffect(() => {
    void (async () => {
      await refresh(true);
    })();
  }, [refresh, refreshSignal]);

  async function createWallet() {
    setLoading(true);
    setNote("");
    try {
      const r = await fetch("/api/wallet/create", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        setPublicKey(d.publicKey);
        setNote("Wallet ready. Unfunded; fund it from the devnet faucet.");
        await refresh();
      } else {
        setNote("Failed to create wallet.");
      }
    } catch {
      setNote("Request failed.");
    } finally {
      setLoading(false);
    }
  }

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 18,
    marginTop: 28,
  };

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Wallet</h2>
      <p style={{ color: "var(--muted)", margin: "0 0 14px", fontSize: 14 }}>
        One Solana devnet wallet per browser. The secret key is generated and kept server-side.
      </p>

      {publicKey ? (
        <div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Address</div>
          <code style={{ wordBreak: "break-all", fontSize: 13 }}>{publicKey}</code>
          <div style={{ marginTop: 10, fontSize: 14 }}>
            Balance: <strong>{balance.toFixed(4)} SOL</strong>
          </div>

          {tokens.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>SPL tokens</div>
              {tokens.map((t) => (
                <div
                  key={t.mint}
                  style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "3px 0" }}
                >
                  <a
                    href={`https://explorer.solana.com/address/${t.mint}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontFamily: "var(--mono)", wordBreak: "break-all" }}
                    title={t.mint}
                  >
                    {t.mint.slice(0, 4)}…{t.mint.slice(-4)}
                  </a>
                  <strong style={{ whiteSpace: "nowrap" }}>{t.amount}</strong>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => refresh()} disabled={loading} style={btn(false)}>
              Refresh
            </button>
            <a
              href={`https://explorer.solana.com/address/${publicKey}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              View on explorer
            </a>
          </div>
        </div>
      ) : (
        <button onClick={createWallet} disabled={loading} style={btn(true)}>
          {loading ? "Creating..." : "Create wallet"}
        </button>
      )}

      {note && <p style={{ marginTop: 12, fontSize: 13, color: "var(--muted)" }}>{note}</p>}
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    font: "inherit",
    fontSize: 14,
    fontWeight: 600,
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    background: primary ? "var(--accent)" : "var(--surface)",
    color: primary ? "#fff" : "var(--text)",
    boxShadow: primary ? "none" : "inset 0 0 0 1px var(--border)",
  };
}
