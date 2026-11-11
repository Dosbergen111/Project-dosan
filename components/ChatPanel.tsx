"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Account = { id: number; username: string };
type ChatMessage = {
  id: number;
  userId: number;
  username: string;
  message: string;
  sentAt: string;
};

export default function ChatPanel({
  account,
  active,
}: {
  account: Account | null;
  active: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const lastMessagesJson = useRef<string | null>(null);

  const loadMessages = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/chat/messages", { cache: "no-store", signal });
    const data = (await response.json()) as { messages?: ChatMessage[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить чат.");
    if (signal?.aborted) return;

    const nextMessages = data.messages ?? [];
    const nextMessagesJson = JSON.stringify(nextMessages);
    if (lastMessagesJson.current !== nextMessagesJson) {
      lastMessagesJson.current = nextMessagesJson;
      setMessages(nextMessages);
    }
    setError((current) => (current ? "" : current));
  }, []);

  useEffect(() => {
    if (!active) return;

    let polling = true;
    let timer: number | undefined;
    const controller = new AbortController();
    const poll = async () => {
      try {
        await loadMessages(controller.signal);
      } catch (cause) {
        if (polling && !controller.signal.aborted) {
          const nextError = cause instanceof Error ? cause.message : "Ошибка загрузки чата.";
          setError((current) => (current === nextError ? current : nextError));
        }
      } finally {
        if (polling) timer = window.setTimeout(() => void poll(), 4000);
      }
    };
    void poll();

    return () => {
      polling = false;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active, loadMessages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || !text.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: account.id,
          username: account.username,
          message: text.trim(),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось отправить сообщение.");
      setText("");
      await loadMessages();
    } catch (cause) {
      const nextError = cause instanceof Error ? cause.message : "Не удалось отправить сообщение.";
      setError((current) => (current === nextError ? current : nextError));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-panel">
      <h2>💬 Глобальный чат</h2>
      <div id="chat-box" className="chat-box" aria-live="polite">
        {error && <p className="chat-error">{error}</p>}
        {!messages.length && !error && <p className="chat-empty">Чат пуст.</p>}
        {messages.map((item) => (
          <div className="chat-msg" key={item.id}>
            <strong>{item.username}</strong>
            <span> · {new Date(item.sentAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
            <p>{item.message}</p>
          </div>
        ))}
      </div>
      <form className="chat-input-row" onSubmit={sendMessage}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={account ? "Напишите сообщение..." : "Войдите, чтобы писать в чат"}
          aria-label="Сообщение"
          maxLength={500}
          disabled={!account || sending}
        />
        <button type="submit" disabled={!account || sending || !text.trim()}>
          {sending ? "Отправка…" : "Отправить"}
        </button>
      </form>
      {!account && <p className="chat-note">Войдите в аккаунт, чтобы отправлять сообщения.</p>}
    </div>
  );
}
