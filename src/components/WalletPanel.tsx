"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import WalletCreator from "./WalletCreator";
import FundSplitter from "./FundSplitter";

// Delay before the follow-up refresh, to let RPC state propagate past the
// `confirmed` commitment the split already awaited.
const SETTLE_REFRESH_MS = 2500;

// Owns the refresh signal shared by the two cards: a successful split bumps the
// counter, which makes WalletCreator re-fetch its SOL + token balances live. A
// split fires an immediate bump plus one delayed bump, so balances settle fully
// hands-off even if the node lags a beat.
export default function WalletPanel() {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSplit = useCallback(() => {
    setRefreshSignal((n) => n + 1); // immediate
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRefreshSignal((n) => n + 1), SETTLE_REFRESH_MS); // settle
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <>
      <WalletCreator refreshSignal={refreshSignal} />
      <FundSplitter onSplit={onSplit} />
    </>
  );
}
