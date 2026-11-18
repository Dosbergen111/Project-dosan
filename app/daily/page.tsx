"use client";

import DailyMatch from "@/components/daily/DailyMatch";
import { useAuth } from "@/components/AuthProvider";

function DailyRoute() {
  const { account, isSessionLoading, setAccount } = useAuth();
  return (
    <DailyMatch
      account={account}
      isSessionLoading={isSessionLoading}
      onProfile={(profile) => setAccount((previous) => previous ? { ...previous, ...profile } : previous)}
    />
  );
}

export default function DailyPage() {
  return <DailyRoute />;
}
