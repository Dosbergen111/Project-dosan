"use client";

import OnlinePanel from "@/components/online/OnlinePanel";
import { useAuth } from "@/components/AuthProvider";

export default function OnlinePage() {
  const { account, setAccount } = useAuth();
  return (
    <OnlinePanel
      account={account}
      onProfile={(profile) => setAccount((previous) => previous ? { ...previous, ...profile } : previous)}
    />
  );
}
