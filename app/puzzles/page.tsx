"use client";

import PuzzlesPanel from "@/components/puzzles/PuzzlesPanel";
import { useAuth } from "@/components/AuthProvider";

export default function PuzzlesPage() {
  const { account } = useAuth();
  return <PuzzlesPanel userId={account?.id ?? null} />;
}
