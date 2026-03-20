"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { sendCopilotChatMessage } from "@/lib/api";
import type { CopilotChatMessage } from "@/types/copilot-chat";

const QUICK_SUGGESTIONS = [
  "What should I prioritize today?",
  "Which candidates need follow-up?",
  "Dashboard summary",
  "Best candidates for frontend developer",
] as const;

export type CopilotChatProps = {
  /** Deep-link or parent can seed the input once */
  initialPrompt?: string;
  /** Reserved for pipeline integration: show context chips, future API fields */
  contextApplicationIds?: string[];
  contextLabel?: string;
};

export function CopilotChat({
  initialPrompt,
  contextApplicationIds,
  contextLabel,
}: CopilotChatProps) {
  const [messages, setMessages] = useState<CopilotChatMessage[]>([]);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (initialPrompt && !seededRef.current) {
      setInput(initialPrompt);
      seededRef.current = true;
    }
  }, [initialPrompt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, error]);

  const historyForApi = useCallback((): CopilotChatMessage[] => {
    return messages.map(({ role, content, metadata }) => {
      const h: CopilotChatMessage = { role, content };
      if (metadata !== undefined) h.metadata = metadata;
      return h;
    });
  }, [messages]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || loading) return;

      setError(null);
      setLoading(true);

      const userMsg: CopilotChatMessage = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");

      try {
        const prior = historyForApi();
        const res = await sendCopilotChatMessage(text, prior);

        const assistantMsg: CopilotChatMessage = {
          role: "assistant",
          content: res.reply,
          ...(res.metadata !== undefined && { metadata: res.metadata }),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (e) {
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
        setError(
          e instanceof Error ? e.message : "Something went wrong. Try again."
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, historyForApi]
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    setInput("");
  };

  return (
    <div className="flex min-h-[70vh] flex-col rounded-lg border border-stone-200 bg-white">
      {(contextApplicationIds?.length || contextLabel) && (
        <div className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs text-stone-600">
          {contextLabel && <span>{contextLabel}</span>}
          {contextApplicationIds && contextApplicationIds.length > 0 && (
            <span className="ml-2 rounded-md bg-white px-2 py-0.5 text-[11px] text-stone-500">
              {contextApplicationIds.length} application
              {contextApplicationIds.length === 1 ? "" : "s"} in context
            </span>
          )}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !loading && (
          <p className="text-center text-sm text-stone-500">
            Type below or pick a suggestion to get started.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}-${m.content.slice(0, 20)}`}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-teal-700 text-white"
                  : "border border-stone-200 bg-stone-50 text-stone-800"
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-500">
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-teal-600"
                aria-hidden
              />
              Thinking…
            </div>
          </div>
        )}

        {error && (
          <div
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-stone-200 bg-stone-50/80 p-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={loading}
              onClick={() => void send(s)}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about your pipeline…"
            rows={2}
            disabled={loading}
            className="min-h-[44px] flex-1 resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 disabled:bg-stone-50"
            aria-label="Message to copilot"
          />
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={clearChat}
              disabled={loading || messages.length === 0}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40 transition-colors"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-40 transition-colors"
            >
              Send
            </button>
          </div>
        </form>
        <p className="mt-2 text-[11px] text-stone-400">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
