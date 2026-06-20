"use client";

import { useState } from "react";

type Row = { address: string; amount: string };
type SplitResult =
  | { ok: true; signature: string; kind: "sol" | "token"; recipients: number; totalBaseUnits: string }
  | { ok: false; error: string };

const EXPLORER_TX = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// Multi-transfer UI: split native SOL or an SPL token from this browser's wallet
// to many recipients in one transaction. Drives POST /api/wallet/split.
export default function FundSplitter({ onSplit }: { onSplit?: () => void }) {
  const [mint, setMint] = useState("");
  const [rows, setRows] = useState<Row[]>([{ address: "", amount: "" }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SplitResult | null>(null);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { address: "", amount: "" }]);
  const removeRow = (i: number) => setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, j) => j !== i)));

  async function submit() {
    setLoading(true);
    setResult(null);
    try {
      const recipients = rows
        .map((r) => ({ address: r.address.trim(), amount: Number(r.amount) }))
        .filter((r) => r.address && Number.isFinite(r.amount) && r.amount > 0);
      if (recipients.length === 0) {
        setResult({ ok: false, error: "Add at least one recipient with a positive amount." });
        return;
      }
      const r = await fetch("/api/wallet/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, mint: mint.trim() || undefined }),
      });
      const data: SplitResult = await r.json();
      setResult(data);
      // On success, balances changed on-chain; refresh the wallet card live.
      if (data.ok) onSplit?.();
    } catch {
      setResult({ ok: false, error: "Request failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Split funds</h2>
      <p style={{ color: "var(--muted)", margin: "0 0 14px", fontSize: 14 }}>
        Send SOL or an SPL token to many recipients in one transaction. Leave the mint blank to send
        native SOL. Amounts are in token units (e.g. 1.5).
      </p>

      <label style={lbl}>Token mint (optional — blank = SOL)</label>
      <input
        value={mint}
        onChange={(e) => setMint(e.target.value)}
        placeholder="SPL mint address, or blank for SOL"
        style={input}
        spellCheck={false}
      />

      <label style={{ ...lbl, marginTop: 14 }}>Recipients</label>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={row.address}
            onChange={(e) => setRow(i, { address: e.target.value })}
            placeholder="recipient wallet address"
            style={{ ...input, flex: 1, marginBottom: 0 }}
            spellCheck={false}
          />
          <input
            value={row.amount}
            onChange={(e) => setRow(i, { amount: e.target.value })}
            placeholder="amount"
            inputMode="decimal"
            style={{ ...input, width: 110, marginBottom: 0 }}
          />
          <button onClick={() => removeRow(i)} disabled={rows.length === 1} style={iconBtn} title="Remove">
            ×
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
        <button onClick={addRow} style={btn(false)}>
          + Add recipient
        </button>
        <button onClick={submit} disabled={loading} style={btn(true)}>
          {loading ? "Sending..." : "Send split"}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 14, fontSize: 13 }}>
          {result.ok ? (
            <div>
              <div style={{ color: "var(--text)" }}>
                Sent {result.kind === "sol" ? "SOL" : "token"} to {result.recipients} recipient
                {result.recipients === 1 ? "" : "s"}.
              </div>
              <a href={EXPLORER_TX(result.signature)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            </div>
          ) : (
            <div style={{ color: "#ff6b6b" }}>{result.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 18,
  marginTop: 20,
};

const lbl: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "var(--muted)",
  marginBottom: 6,
};

const input: React.CSSProperties = {
  font: "inherit",
  fontSize: 14,
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  marginBottom: 10,
};

const iconBtn: React.CSSProperties = {
  font: "inherit",
  fontSize: 18,
  lineHeight: 1,
  width: 38,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--muted)",
  cursor: "pointer",
};

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
