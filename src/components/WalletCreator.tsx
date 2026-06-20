"use client";

import { useEffect, useState } from "react";

type AppState = { wallet: { publicKey: string; solBalance: number } };

export default function WalletCreator() {
  const [publicKey, setPublicKey] = useState("");
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  async function refresh() {
    const r = await fetch("/api/state", { cache: "no-store" });
    const s: AppState = await r.json();
    setPublicKey(s.wallet.publicKey);
    setBalance(s.wallet.solBalance);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch("/api/state", { cache: "no-store" });
        const s: AppState = await r.json();
        if (!active) return;
        setPublicKey(s.wallet.publicKey);
        setBalance(s.wallet.solBalance);
      } catch {
        // ignore: wallet just not provisioned yet
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function createWallet() {
    setLoading(true);
    setNote("");
    try {
      const r = await fetch("/api/wallet/create", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        setPublicKey(d.publicKey);
        setNote("Wallet ready. Unfunded; airdrop is a separate step.");
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
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={refresh} disabled={loading} style={btn(false)}>
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
