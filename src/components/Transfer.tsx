"use client";

import { useEffect, useMemo, useState } from "react";
import { KNOWN_TOKENS } from "@/lib/config";

type Contact = { name: string; address: string };

const CONTACTS_KEY = "solhakathon.contacts";
// Basic base58 shape check for instant feedback; the server does the real
// PublicKey validation before broadcasting.
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Token options: the known presets (SOL, USDC) plus a "Custom" mint entry.
const CUSTOM = "CUSTOM";

const short = (addr: string) => (addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr);

function loadContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    const list = raw ? (JSON.parse(raw) as Contact[]) : [];
    return Array.isArray(list) ? list.filter((c) => c && c.name && c.address) : [];
  } catch {
    return [];
  }
}

export default function Transfer() {
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [tokenKey, setTokenKey] = useState("SOL"); // a KNOWN_TOKENS symbol or CUSTOM
  const [customMint, setCustomMint] = useState("");
  const [saveName, setSaveName] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; sig?: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) setContacts(loadContacts());
      try {
        const r = await fetch("/api/state", { cache: "no-store" });
        const s = await r.json();
        if (active) setHasWallet(Boolean(s?.wallet?.publicKey));
      } catch {
        if (active) setHasWallet(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function persistContacts(next: Contact[]) {
    setContacts(next);
    try {
      localStorage.setItem(CONTACTS_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable (private mode); contacts just won't persist
    }
  }

  const addressValid = ADDRESS_RE.test(to.trim());
  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const knownContact = useMemo(
    () => contacts.find((c) => c.address === to.trim()),
    [contacts, to],
  );

  // Resolve the selected token to a mint (null = native SOL) + a display symbol.
  const isCustom = tokenKey === CUSTOM;
  const preset = KNOWN_TOKENS.find((t) => t.symbol === tokenKey);
  const mint: string | null = isCustom ? customMint.trim() : preset?.mint ?? null;
  const unit = isCustom ? "tokens" : tokenKey;
  const mintValid = !isCustom || ADDRESS_RE.test(customMint.trim());

  function saveContact() {
    const name = saveName.trim();
    const address = to.trim();
    if (!name || !ADDRESS_RE.test(address)) return;
    const next = [...contacts.filter((c) => c.address !== address), { name, address }];
    persistContacts(next);
    setSaveName("");
  }

  function removeContact(address: string) {
    persistContacts(contacts.filter((c) => c.address !== address));
  }

  async function send() {
    if (!addressValid || !amountValid || !mintValid || sending) return;
    setSending(true);
    setResult(null);
    try {
      const r = await fetch("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), amount: amountNum, mint: mint ?? undefined }),
      });
      const d = await r.json();
      if (d.ok) {
        // SOL transfers can report the live SOL balance; token transfers just
        // confirm the amount sent (SOL balance only moved by the network fee).
        const text =
          d.kind === "sol"
            ? `Sent ${d.amount} SOL. New balance: ${Number(d.balance).toFixed(4)} SOL.`
            : `Sent ${d.amount} ${unit}.`;
        setResult({ ok: true, text, sig: d.signature });
        setAmount("");
      } else {
        setResult({ ok: false, text: d.error || "Transfer failed." });
      }
    } catch {
      setResult({ ok: false, text: "Request failed." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={card}>
      <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Send funds</h2>
      <p style={{ color: "var(--muted)", margin: "0 0 14px", fontSize: 14 }}>
        Transfer devnet SOL or an SPL token (e.g. USDC) to a single recipient. Save addresses as
        contacts for quick reuse.
      </p>

      {hasWallet === false && (
        <p style={{ ...notice, color: "var(--muted)" }}>
          Create a wallet above first — then you can send from it.
        </p>
      )}

      {contacts.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={label}>Contacts</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {contacts.map((c) => {
              const selected = c.address === to.trim();
              return (
                <span key={c.address} style={chip(selected)}>
                  <button
                    type="button"
                    onClick={() => setTo(c.address)}
                    style={chipMain}
                    title={c.address}
                  >
                    {c.name} <span style={{ color: "var(--muted)" }}>{short(c.address)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeContact(c.address)}
                    style={chipX}
                    aria-label={`Remove ${c.name}`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div style={label}>Recipient address</div>
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="Recipient's devnet address"
        spellCheck={false}
        style={input(to.length > 0 && !addressValid)}
      />
      {to.length > 0 && !addressValid && (
        <div style={hint}>That doesn’t look like a valid Solana address.</div>
      )}
      {knownContact && (
        <div style={{ ...hint, color: "var(--accent)" }}>Contact: {knownContact.name}</div>
      )}

      {!knownContact && addressValid && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Save as contact (name)"
            style={{ ...input(false), marginTop: 0, flex: 1 }}
          />
          <button type="button" onClick={saveContact} disabled={!saveName.trim()} style={btn(false)}>
            Save
          </button>
        </div>
      )}

      <div style={{ ...label, marginTop: 14 }}>Token</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {KNOWN_TOKENS.map((t) => (
          <button
            key={t.symbol}
            type="button"
            onClick={() => setTokenKey(t.symbol)}
            style={tokenBtn(tokenKey === t.symbol)}
          >
            {t.symbol}
          </button>
        ))}
        <button type="button" onClick={() => setTokenKey(CUSTOM)} style={tokenBtn(isCustom)}>
          Custom
        </button>
      </div>
      {isCustom && (
        <input
          value={customMint}
          onChange={(e) => setCustomMint(e.target.value)}
          placeholder="SPL token mint address"
          spellCheck={false}
          style={{ ...input(customMint.length > 0 && !mintValid), marginTop: 8 }}
        />
      )}

      <div style={{ ...label, marginTop: 14 }}>Amount ({unit})</div>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.1"
        inputMode="decimal"
        style={input(amount.length > 0 && !amountValid)}
      />

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={send}
          disabled={!addressValid || !amountValid || !mintValid || sending || hasWallet === false}
          style={{
            ...btn(true),
            opacity: !addressValid || !amountValid || !mintValid || hasWallet === false ? 0.5 : 1,
          }}
        >
          {sending ? "Sending…" : `Send ${unit === "tokens" ? "" : unit}`.trim()}
        </button>
      </div>

      {result && (
        <div style={{ ...notice, color: result.ok ? "var(--text)" : "#ff6b6b" }}>
          {result.text}
          {result.sig && (
            <>
              {" "}
              <a
                href={`https://explorer.solana.com/tx/${result.sig}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction
              </a>
            </>
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

const label: React.CSSProperties = { fontSize: 13, color: "var(--muted)", marginBottom: 6 };
const hint: React.CSSProperties = { fontSize: 12, color: "var(--muted)", marginTop: 6 };
const notice: React.CSSProperties = { marginTop: 14, fontSize: 13 };

function input(invalid: boolean): React.CSSProperties {
  return {
    width: "100%",
    font: "inherit",
    fontSize: 14,
    padding: "10px 12px",
    borderRadius: 10,
    background: "var(--bg)",
    color: "var(--text)",
    border: `1px solid ${invalid ? "#ff6b6b" : "var(--border)"}`,
    outline: "none",
  };
}

function tokenBtn(selected: boolean): React.CSSProperties {
  return {
    font: "inherit",
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 14px",
    borderRadius: 999,
    cursor: "pointer",
    background: selected ? "var(--accent)" : "var(--bg)",
    color: selected ? "#fff" : "var(--text)",
    border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
  };
}

function chip(selected: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    background: "var(--bg)",
    border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
    overflow: "hidden",
  };
}

const chipMain: React.CSSProperties = {
  font: "inherit",
  fontSize: 13,
  padding: "6px 10px",
  border: "none",
  background: "transparent",
  color: "var(--text)",
  cursor: "pointer",
};

const chipX: React.CSSProperties = {
  font: "inherit",
  fontSize: 15,
  lineHeight: 1,
  padding: "6px 9px",
  border: "none",
  borderLeft: "1px solid var(--border)",
  background: "transparent",
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
