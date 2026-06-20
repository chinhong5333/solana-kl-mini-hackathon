import WalletPanel from "@/components/WalletPanel";
import Transfer from "@/components/Transfer";

export default function Home() {
  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "72px 24px",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 34, letterSpacing: "-0.02em", marginBottom: 8 }}>
        SolSplit
      </h1>

      <WalletPanel />
      <Transfer />

      <h2 style={{ fontSize: 18, marginTop: 36 }}>Quick start</h2>
      <pre
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
          overflowX: "auto",
        }}
      >
        <code>
          npm install{"\n"}
          npm run dev   # http://localhost:3000
        </code>
      </pre>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Where to build</h2>
      <ul style={{ color: "var(--muted)", paddingLeft: 18 }}>
        <li>
          Pages / UI: <code>src/app/</code>
        </li>
        <li>
          API routes: <code>src/app/api/</code> (see{" "}
          <a href="/api/health">/api/health</a>)
        </li>
        <li>
          Shared code: <code>src/lib/</code> (import via <code>@/lib/...</code>)
        </li>
      </ul>

      <p style={{ color: "var(--muted)", marginTop: 28, fontSize: 14 }}>
        Branch off <code>main</code>, open a PR. See <code>README.md</code> for
        the full workflow.
      </p>
    </main>
  );
}
