import { useState, useEffect, useRef } from "react";
import { PartyPopper, Video, MessageSquare, Swords, Copy, Users, ArrowLeft, Send } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { store } from "@/store";
import { Button, Card, Input } from "@/components/ui";

interface Props {
  battle: any;
  userId: string;
  displayName: string;
  onExit: () => void;
  onStartBattle: () => void;
}

interface ChatMsg {
  user: string;
  text: string;
  time: string;
}

export default function StudyPartyPage({ battle, userId, displayName, onExit, onStartBattle }: Props) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<"lobby" | "watch" | "discuss" | "quiz">("lobby");
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [players, setPlayers] = useState<any[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inviteCode = battle.invite_code;

  useEffect(() => {
    const wsBase = (import.meta.env.VITE_WS_URL ?? "ws://localhost:8010").replace(/\/$/, "");
    // The server authenticates the socket via the JWT access token (WebSockets
    // can't carry an Authorization header from the browser), and derives the
    // caller's identity from it — user_id is no longer accepted for identity.
    const token = store.getState().auth.token ?? "";
    const ws = new WebSocket(`${wsBase}/api/v1/battles/${battle.id}/ws?token=${encodeURIComponent(token)}&display_name=${encodeURIComponent(displayName)}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const payload = msg.payload ?? msg;
        if (msg.type === "player_joined") {
          const p = payload.participant ?? payload;
          setPlayers((prev) => {
            if (prev.find((x) => x.user_id === p.user_id)) return prev;
            return [...prev, { user_id: p.user_id, display_name: p.display_name }];
          });
        }
        if (msg.type === "player_left") {
          setPlayers((prev) => prev.filter((x) => x.user_id !== (payload.user_id ?? msg.user_id)));
        }
        if (msg.type === "chat_message") {
          setChatMsgs((prev) => [...prev, { user: payload.display_name, text: payload.text, time: new Date().toLocaleTimeString() }]);
        }
        if (msg.type === "phase_change") {
          setPhase(payload.phase ?? msg.phase);
        }
      } catch {}
    };
    return () => ws.close();
  }, [battle.id, userId]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: 99999, behavior: "smooth" });
  }, [chatMsgs]);

  const sendChat = () => {
    if (!chatInput.trim()) return;
    wsRef.current?.send(JSON.stringify({ type: "chat", payload: { text: chatInput.trim(), display_name: displayName } }));
    setChatMsgs((prev) => [...prev, { user: displayName, text: chatInput.trim(), time: new Date().toLocaleTimeString() }]);
    setChatInput("");
  };

  const copyCode = () => { navigator.clipboard.writeText(inviteCode); toast.success("Code copied!"); };

  return (
    <div className="w-full space-y-4 animate-fade-in">
      {/* Header */}
      <div className="rounded-2xl bg-primary-600 p-5 text-white">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="text-white/70 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold flex items-center gap-2"><PartyPopper className="w-6 h-6" /> {t("studyParty")}</h2>
            <p className="text-primary-200 text-sm truncate">{battle.subject} · {players.length + 1} people · Code: <span className="font-mono font-bold">{inviteCode}</span></p>
          </div>
          <button onClick={copyCode} className="text-primary-200 hover:text-white flex-shrink-0"><Copy className="w-4 h-4" /></button>
        </div>

        {/* Phase tabs */}
        <div className="grid grid-cols-2 xs:flex gap-2 mt-4">
          {["lobby", "watch", "discuss", "quiz"].map((p) => (
            <button key={p} onClick={() => setPhase(p as "lobby" | "watch" | "discuss" | "quiz")}
              className={`xs:flex-1 py-1.5 px-1 text-[11px] xs:text-xs font-semibold rounded-lg capitalize transition-all truncate ${phase === p ? "bg-white text-primary-600" : "bg-white/15 text-white/80 hover:bg-white/25"}`}>
              {p === "lobby" ? "1. Lobby" : p === "watch" ? "2. Watch" : p === "discuss" ? "3. Discuss" : "4. Quiz"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {phase === "lobby" && (
            <Card className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Users className="w-5 h-5 text-primary-500" /> {t("waitingPlayers")}</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-2 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-primary-200 dark:bg-primary-800 flex items-center justify-center text-primary-700 dark:text-primary-200 font-bold text-sm flex-shrink-0">{displayName.charAt(0)}</div>
                  <span className="text-sm font-semibold text-primary-700 dark:text-primary-300 truncate min-w-0 flex-1">{displayName} (You) 👑</span>
                </div>
                {players.map((p) => (
                  <div key={p.user_id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm flex-shrink-0">{p.display_name.charAt(0)}</div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate min-w-0 flex-1">{p.display_name}</span>
                    <span className="ml-auto flex-shrink-0 w-2 h-2 rounded-full bg-success-400 animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>📱 Step 1: Share code <strong>{inviteCode}</strong> — friends join</p>
                <p>🎬 Step 2: Click "Watch" to sync a video together</p>
                <p>💬 Step 3: Discuss what you learned</p>
                <p>⚔️ Step 4: Start a quiz battle!</p>
              </div>
              <Button onClick={() => setPhase("watch")} fullWidth>{t("createRoom")}</Button>
            </Card>
          )}

          {phase === "watch" && (
            <Card className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Video className="w-5 h-5 text-primary-500" /> Sync Watch</h3>
              <div className="bg-gray-900 rounded-xl aspect-video flex items-center justify-center px-4">
                <div className="text-center text-gray-500 w-full">
                  <Video className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Synced video watching is coming soon</p>
                  <input
                    disabled
                    className="mt-3 bg-gray-800/50 text-gray-500 px-3 py-2 rounded-lg text-sm w-full max-w-xs mx-auto block cursor-not-allowed"
                    placeholder="https://youtube.com/watch?v=... (coming soon)" />
                </div>
              </div>
              <Button onClick={() => setPhase("discuss")} fullWidth>{t("joinRoom")}</Button>
            </Card>
          )}

          {phase === "discuss" && (
            <Card className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"><MessageSquare className="w-5 h-5 text-primary-500" /> Group Discussion</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Discuss what you learned before the quiz battle.</p>
              <Button onClick={() => setPhase("quiz")} fullWidth className="flex items-center justify-center gap-2">
                <Swords className="w-4 h-4" /> Ready? Start Quiz Battle!
              </Button>
            </Card>
          )}

          {phase === "quiz" && (
            <Card className="text-center py-8">
              <div className="text-5xl mb-4">⚔️</div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Time to Battle!</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">All players will compete on the same questions from the video topic.</p>
              <Button onClick={onStartBattle} className="px-8">Start Battle Now!</Button>
            </Card>
          )}
        </div>

        {/* Chat sidebar */}
        <Card className="flex flex-col" style={{ height: "400px" }}>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary-500" /> Party Chat</h3>
          <div ref={chatRef} className="flex-1 overflow-y-auto space-y-2 text-sm">
            {chatMsgs.length === 0 && (
              <p className="text-gray-400 dark:text-gray-500 text-xs text-center mt-4">No messages yet. Say hello!</p>
            )}
            {chatMsgs.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.user === displayName ? "flex-row-reverse" : ""}`}>
                <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${m.user === displayName ? "bg-primary-200 dark:bg-primary-800 text-primary-700 dark:text-primary-200" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
                  {m.user.charAt(0)}
                </div>
                <div className={`max-w-[80%] rounded-xl px-3 py-1.5 text-xs ${m.user === displayName ? "bg-primary-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"}`}>
                  {m.user !== displayName && <p className="font-semibold text-xs mb-0.5 text-gray-500 dark:text-gray-400">{m.user}</p>}
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <Input
              className="flex-1 text-xs"
              placeholder="Type a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()} />
            <button onClick={sendChat} className="bg-primary-600 hover:bg-primary-700 text-white rounded-xl px-3 flex-shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
