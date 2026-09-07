"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useAISDKRuntime } from "@assistant-ui/ai-sdk";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  type ThreadMessage,
} from "@assistant-ui/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowDown, AudioLines, Check, Copy, FileAudio, LoaderCircle, MessageSquareText, Send, Server, Settings2, Sparkles, Square, X } from "lucide-react";
import { ShimmeringText } from "@/components/elevenlabs-ui/shimmering-text";
import { GeminiIcon } from "@/components/provider-icons";
import { MarkdownMessage } from "@/components/workspace/markdown-message";
import type { ChatProvider, ClipDTO, ConnectionDTO, CustomModelDTO } from "@/lib/types";

type AssistantChatProps = {
  clips: ClipDTO[];
  connections: ConnectionDTO[];
  customModels: CustomModelDTO[];
  onConnect: () => void;
  onRemoveClip: (clipId: string) => void;
};

async function loadConversation<T>(clipIds: string[]): Promise<T> {
  const params = new URLSearchParams();
  clipIds.forEach((id) => params.append("clipId", id));
  const response = await fetch(`/api/conversations?${params}`);
  if (!response.ok) throw new Error("Could not load this conversation.");
  return response.json() as Promise<T>;
}

function messageText(content: ThreadMessage["content"]) {
  return content.flatMap((part) => part.type === "text" ? [part.text] : []).join("");
}

function CopyMessageButton() {
  const copied = useAuiState((state) => state.message.isCopied);
  return (
    <ActionBarPrimitive.Copy className="message-copy" aria-label={copied ? "Copied" : "Copy response"} title={copied ? "Copied" : "Copy response"}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </ActionBarPrimitive.Copy>
  );
}

function ChatMessage({ message }: { message: ThreadMessage }) {
  if (message.role === "system") return null;
  const text = messageText(message.content);
  const streaming = message.status?.type === "running";

  return (
    <MessagePrimitive.Root className={`message ${message.role}`}>
      {message.role === "assistant" && <span className="assistant-mark"><Sparkles size={13} /></span>}
      <div>
        {message.role === "assistant"
          ? <MarkdownMessage content={text} streaming={streaming} />
          : text}
        {message.role === "assistant" && (
          <ActionBarPrimitive.Root className="message-actions" hideWhenRunning autohide="not-last" autohideFloat="never">
            <CopyMessageButton />
          </ActionBarPrimitive.Root>
        )}
      </div>
    </MessagePrimitive.Root>
  );
}

function ComposerMeta() {
  const length = useAuiState((state) => state.composer.text.length);
  return <span className="composer-count">{length}/4,000</span>;
}

export function AssistantChat({ clips, connections, customModels, onConnect, onRemoveClip }: AssistantChatProps) {
  const providers = useMemo(
    () => connections.filter((connection) => connection.connected).map((connection) => connection.provider),
    [connections],
  );
  const modelChoices = useMemo<ChatProvider[]>(
    () => [...providers, ...customModels.map((model) => `custom:${model.id}` as const)],
    [customModels, providers],
  );
  const [provider, setProvider] = useState<ChatProvider>("google");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scopeKey = clips.map((clip) => clip.id).sort().join(",");
  const clipIds = useMemo(() => scopeKey.split(",").filter(Boolean), [scopeKey]);
  const activeProvider = useMemo(
    () => modelChoices.includes(provider)
      ? provider
      : providers.includes("google")
        ? "google"
        : providers.includes("groq")
          ? "groq"
          : modelChoices[0],
    [modelChoices, provider, providers],
  );
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { clipIds, provider: activeProvider, message: messages.at(-1) },
      }),
    }),
    [activeProvider, clipIds],
  );
  const chat = useChat({ id: scopeKey, transport, experimental_throttle: 40 });
  const { setMessages } = chat;
  const runtime = useAISDKRuntime(chat);
  const connected = modelChoices.length > 0;
  const plural = clips.length > 1;
  const suggestions = [plural ? "Compare these clips" : "Summarize this clip", "What are the action items?", "क्या मुख्य बातें थीं?"];

  useEffect(() => {
    let live = true;
    loadConversation<{ messages: UIMessage[] }>(clipIds)
      .then(({ messages }) => { if (live) setMessages(messages); })
      .catch(() => undefined)
      .finally(() => { if (live) setHistoryLoaded(true); });
    return () => { live = false; };
  }, [clipIds, setMessages]);

  return (
    <div className="chat-layout">
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="assistant-thread">
          <ThreadPrimitive.Viewport className="messages" autoScroll>
            {historyLoaded && !chat.messages.length && (
              <div className="chat-intro">
                <span><MessageSquareText size={20} /></span>
                <b>What would you like to know?</b>
                <p>Ask for decisions, action items, a summary, or compare anything mentioned across the selected recordings.</p>
                {suggestions.map((suggestion) => <button key={suggestion} disabled={!connected || chat.status !== "ready"} onClick={() => chat.sendMessage({ text: suggestion })}>{suggestion}</button>)}
              </div>
            )}
            {!historyLoaded && <div className="thinking conversation-loading" role="status"><LoaderCircle className="spin" size={14} />Loading conversation…</div>}
            <ThreadPrimitive.Messages>{({ message }) => <ChatMessage message={message} />}</ThreadPrimitive.Messages>
            {chat.error && <p className="chat-error" role="alert">{chat.error.message}</p>}
            {chat.status === "submitted" && <div className="thinking" role="status"><LoaderCircle className="spin" size={14} /><ShimmeringText text={`Reading ${plural ? "transcripts" : "transcript"}…`} /></div>}
            <ThreadPrimitive.ScrollToBottom className="scroll-to-bottom" aria-label="Scroll to latest message"><ArrowDown size={14} /></ThreadPrimitive.ScrollToBottom>
          </ThreadPrimitive.Viewport>
          <ComposerPrimitive.Root className="composer">
            <div className="composer-sources" aria-label="Selected audio clips">
              {clips.map((clip) => <span key={clip.id} title={clip.title}><FileAudio size={14}/><b>{clip.title}</b><button type="button" onClick={() => onRemoveClip(clip.id)} aria-label={`Remove ${clip.title} from chat`}><X size={11}/></button></span>)}
            </div>
            <ComposerPrimitive.Input
              aria-label="Ask about selected clips"
              maxLength={4000}
              rows={2}
              placeholder={!historyLoaded ? "Loading conversation…" : connected ? plural ? `Ask across ${clips.length} clips…` : "Ask about this clip…" : "Connect an AI provider to start"}
              disabled={!connected || !historyLoaded}
            />
            <div className="composer-footer">
              {connected && activeProvider && <label className="composer-model-picker">
                {activeProvider === "google" ? <GeminiIcon size={14}/> : activeProvider === "groq" ? <AudioLines size={14}/> : <Server size={14}/>}
                <select value={activeProvider} onChange={(event) => setProvider(event.target.value as ChatProvider)} aria-label="AI model">
                  {providers.map((value) => {const connection=connections.find((item)=>item.provider===value);return <option key={value} value={value}>{value === "groq" ? "Groq" : "Gemini"} · {connection?.models.chat}</option>})}
                  {customModels.map((model)=><option key={model.id} value={`custom:${model.id}`}>{model.providerName} · {model.name}</option>)}
                </select>
              </label>}
              <button type="button" className="composer-settings" onClick={onConnect} aria-label="Manage AI models" title="Manage AI models"><Settings2 size={14}/></button>
              <ComposerMeta />
              {chat.status === "streaming" || chat.status === "submitted"
                ? <button type="button" aria-label="Stop response" onClick={() => chat.stop()}><Square size={13} fill="currentColor" /></button>
                : <ComposerPrimitive.Send aria-label="Send" disabled={!connected || !historyLoaded}><Send size={16} /></ComposerPrimitive.Send>}
            </div>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </div>
  );
}
