"use client";

import ChatPanel from "@/components/chat/ChatPanel";
import { useAuth } from "@/components/AuthProvider";

export default function ChatPage() {
  const { account } = useAuth();
  return <ChatPanel account={account} active />;
}
