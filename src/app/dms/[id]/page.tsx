"use client";

import React, { useState, useEffect, useRef, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import Image from "next/image";
import { Navbar } from "@/components/Navbar";
import { Loader2, ArrowLeft, Send, MessageSquare, AlertCircle, Check, CheckCheck } from "lucide-react";
import Link from "next/link";
import type { ConversationDetail, ConversationMessage } from '@/types/conversation';

import { getErrorMessage } from '@/lib/errors';
export default function ConversationThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: conversationId } = use(params);
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCountRef = useRef(0);
  const socketRef = useRef<Socket | null>(null);
  const myIdRef = useRef<string | undefined>(undefined);
  // A synchronous guard, unlike the `sending` state below: React state updates
  // aren't applied until the next render, so a fast double submit (double
  // click/tap, or a stray duplicate `submit` event) can call this handler
  // twice before the first `setSending(true)` has actually taken effect,
  // slipping both calls past a state-only check and posting the message
  // twice. This ref flips synchronously, closing that race.
  const sendInFlightRef = useRef(false);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/sign-in");
  }, [authStatus, router]);

  useEffect(() => {
    myIdRef.current = session?.user?.id;
  }, [session?.user?.id]);

  async function fetchMessages(isInitial = false) {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!res.ok) throw new Error("Failed to load conversation");
      const json = await res.json();
      setConversation(json.data);
      setMessages(json.data.messages || []);
    } catch (err: unknown) {
      if (isInitial) setError(getErrorMessage(err, "Could not load conversation"));
    } finally {
      if (isInitial) setLoading(false);
    }
  }

  // Initial full history load (also marks incoming messages read as a side effect
  // on the server) — real-time updates after this come from the socket, not polling.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    fetchMessages(true);
  }, [authStatus, conversationId]);

  // Real-time message delivery via Socket.IO — replaces the old 3-second REST poll.
  useEffect(() => {
    if (authStatus !== "authenticated") return;

    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("conversation:join", conversationId);
    });

    socket.on("message:new", (incoming: ConversationMessage) => {
      if (incoming.conversationId !== conversationId) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev, incoming];
      });

      // A message from the other participant just arrived while this thread is
      // open — refresh once (marks it read server-side and picks up fields a
      // bare socket payload doesn't carry). Event-triggered, not a timer, so
      // this isn't polling.
      if (incoming.senderId && incoming.senderId !== myIdRef.current) {
        fetchMessages(false);
      }
    });

    socket.on("messages:read", (payload: { conversationId: string }) => {
      if (payload.conversationId !== conversationId) return;
      // The other participant just read our messages — refresh to update the
      // seen-checkmark on our last outgoing message.
      fetchMessages(false);
    });

    return () => {
      socket.emit("conversation:leave", conversationId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authStatus, conversationId]);

  // Only auto-scroll when a message was actually added — not on every poll tick, which
  // would otherwise yank the view back to the bottom while someone is reading older history.
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    const textToSend = inputText.trim();
    try {
      setSending(true);
      setSendError(null);
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageText: textToSend }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to send message");
      }
      setInputText("");
      // Show the new message immediately rather than waiting for the next poll tick.
      setMessages((prev) => [...prev, json.data]);
    } catch (err: unknown) {
      setSendError(getErrorMessage(err, "Failed to send message."));
    } finally {
      setSending(false);
      sendInFlightRef.current = false;
    }
  };

  if (authStatus === "loading" || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="max-w-md mx-auto my-auto p-6 text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-900">Conversation Not Found</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            The message thread could not be found or you do not have permission to view it.
          </p>
          <button
            onClick={() => router.push("/dms")}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm"
          >
            Back to Messages
          </button>
        </div>
      </div>
    );
  }

  const otherUser = conversation.otherUser;
  const links = conversation.links || [];
  const myId = session?.user?.id;

  // Determine if the last message sent by me is seen (has readAt)
  const myMessages = messages.filter((m) => m.senderId === myId && !m.isSystem);
  const lastMyMsg = myMessages[myMessages.length - 1];
  const lastMyMsgIsSeen = lastMyMsg?.readAt != null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
        {/* Header */}
        <div className="flex items-center justify-between gap-4 bg-white border border-slate-200 p-4 rounded-t-2xl shrink-0 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push("/dms")}
              className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {otherUser.photoUrl ? (
              <Image src={otherUser.photoUrl} alt={otherUser.displayName} width={40} height={40} className="rounded-full object-cover border border-slate-200 shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center font-extrabold text-sm shrink-0">
                {otherUser.displayName?.[0] || "U"}
              </div>
            )}

            <div className="min-w-0">
              <h2 className="font-bold text-sm text-slate-900 truncate">{otherUser.displayName}</h2>
              <p className="text-[10px] text-emerald-500 font-semibold">Active</p>
            </div>
          </div>
        </div>

        {/* Context chips */}
        {links.length > 0 && (
          <div className="bg-slate-50 border-x border-slate-200 px-4 py-2 flex flex-wrap gap-2 shrink-0">
            {links.map((link) => {
              const p = link.post;
              return (
                <Link
                  key={link.id}
                  href={`/posts/${p.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 hover:border-indigo-400 rounded-full text-[10px] font-bold text-slate-700 transition-all shadow-sm"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${p.type === "LOST" ? "bg-rose-500" : "bg-emerald-500"}`} />
                  <span className="truncate max-w-[120px] sm:max-w-[200px]">{p.title}</span>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider font-extrabold">({p.status})</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Message bubbles */}
        <div className="flex-1 bg-white border-x border-slate-200 overflow-y-auto p-5 space-y-3 min-h-0">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <MessageSquare className="w-7 h-7 text-indigo-300" />
              </div>
              <p className="text-xs text-slate-400 font-medium">No messages yet. Say hello!</p>
            </div>
          ) : (
            messages.map((m) => {
              // System message
              if (m.isSystem) {
                return (
                  <div key={m.id} className="flex justify-center my-2">
                    <span className="bg-slate-100 text-slate-500 text-[10px] font-semibold py-1 px-3 rounded-full border border-slate-200">
                      {m.body}
                    </span>
                  </div>
                );
              }

              const isMe = m.senderId === myId;
              const isLastFromMe = isMe && m.id === lastMyMsg?.id;

              return (
                <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"} items-end gap-2`}>
                  {/* Other user avatar on left */}
                  {!isMe && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center font-bold text-[9px] shrink-0 mb-1">
                      {otherUser.displayName?.[0] || "U"}
                    </div>
                  )}

                  <div className={`max-w-[72%] space-y-1 ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                    <div
                      className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isMe
                          ? "bg-indigo-600 text-white rounded-br-sm shadow-sm"
                          : "bg-white text-slate-800 rounded-bl-sm border border-slate-200 shadow-sm"
                      }`}
                    >
                      {m.body}
                    </div>
                    <div className={`flex items-center gap-1 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
                      <span className="text-[9px] text-slate-400">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {/* Message status — only on my last outgoing message */}
                      {isLastFromMe && (
                        <span className="flex items-center" title={lastMyMsgIsSeen ? "Seen" : "Sent"}>
                          {lastMyMsgIsSeen ? (
                            <CheckCheck className="w-3 h-3 text-indigo-500" />
                          ) : (
                            <Check className="w-3 h-3 text-slate-400" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Send/share error banner */}
        {sendError && (
          <div className="bg-rose-50 border border-rose-200 border-t-0 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
            <span className="text-xs text-rose-700 font-medium">{sendError}</span>
            <button
              type="button"
              onClick={() => setSendError(null)}
              className="text-[10px] font-bold text-rose-600 hover:underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Input bar */}
        <form
          onSubmit={handleSendMessage}
          className="bg-white border border-slate-200 border-t-0 p-3 rounded-b-2xl flex items-center gap-3 shrink-0 shadow-sm"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-slate-50/50 transition-all"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !inputText.trim()}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all disabled:opacity-40 shrink-0 shadow-sm"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </main>
    </div>
  );
}