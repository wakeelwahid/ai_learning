// Study Party — mobile parity screen for the web StudyPartyPage battle mode.
// Phases: lobby -> watch (sync YouTube video) -> discuss -> quiz (reuses the
// LiveBattleScreen quiz-rendering pattern, since the underlying quiz mechanics
// are the same battle-engine quiz as any other battle type), plus a toggleable
// "Party Chat" drawer wired to the same battle WebSocket used elsewhere in the
// app (see LiveBattleScreen.tsx / BattleScreen.tsx for the connection pattern).
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import Toast from "react-native-toast-message";
import { getAccessToken } from "@/api/secureStorage";
import { battleApi } from "../../api/battle";
import { BASE_URL } from "../../api/client";
import VideoPlayer from "../../components/VideoPlayer";
import { palette, semantic, radius, spacing, typography } from "../../theme/colors";

interface Props {
  battle: any;
  userId: string;
  displayName: string;
  isSpectator?: boolean;
  onExit: () => void;
}

interface Player {
  user_id: string;
  display_name: string;
  score: number;
  xp: number;
  rank?: number;
}

interface ChatMsg {
  user: string;
  text: string;
  time: string;
}

type Phase = "lobby" | "watch" | "discuss" | "quiz" | "finished";

const PHASE_TABS: { key: Phase; label: string }[] = [
  { key: "lobby",   label: "1. Lobby" },
  { key: "watch",   label: "2. Watch" },
  { key: "discuss", label: "3. Discuss" },
  { key: "quiz",    label: "4. Quiz" },
];

// Extract a YouTube video ID from a pasted watch/share/embed URL.
function extractYoutubeId(url: string): string | null {
  const trimmed = url.trim();
  const match = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return match ? match[1] : null;
}

export default function StudyPartyScreen({ battle, userId, displayName, isSpectator = false, onExit }: Props) {
  const navigation = useNavigation<any>();
  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [starting, setStarting] = useState(false);

  // Watch phase
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);

  // Discuss phase
  const [discussSeconds, setDiscussSeconds] = useState(0);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<ScrollView>(null);

  // Quiz phase (mirrors LiveBattleScreen's battle-phase state)
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(battle.time_limit_sec ?? 300);
  const [quizStarted, setQuizStarted] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [rematching, setRematching] = useState(false);
  const questionStart = useRef(0);

  const wsRef        = useRef<WebSocket | null>(null);
  const retryCount   = useRef(0);
  const retryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseDone    = useRef(false);

  const questions: any[] = battle.questions ?? [];
  const totalQ = questions.length;
  const q = questions[currentQ];
  const inviteCode = battle.invite_code;

  // ── WebSocket connection — same pattern as LiveBattleScreen (heartbeat + backoff reconnect) ──
  useEffect(() => {
    connectWs();
    return () => {
      phaseDone.current = true;
      cleanupWs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupWs = () => {
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    wsRef.current?.close();
  };

  const startHeartbeat = (ws: WebSocket) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 25_000); // every 25s — server closes idle after 60s
  };

  const connectWs = async () => {
    if (phaseDone.current) return;
    // The server authenticates the socket via the JWT access token (WebSockets
    // can't carry an Authorization header on the initial handshake), and derives
    // the caller's identity from it — user_id is no longer accepted for identity.
    const token = (await getAccessToken()) ?? "";
    if (phaseDone.current) return; // unmounted while awaiting storage read
    // BASE_URL already applies the EXPO_PUBLIC_API_URL override and the
    // per-platform gateway default. Deriving from the raw env var meant an
    // unset EXPO_PUBLIC_API_URL produced a relative URL that resolved against
    // the Expo dev server origin (ws://localhost:8081) and always failed.
    const wsBase = (process.env.EXPO_PUBLIC_WS_URL ?? BASE_URL.replace(/^http/, "ws").replace(/\/api\/?$/, "")).replace(/\/$/, "");
    const ws = new WebSocket(
      `${wsBase}/api/v1/battles/${battle.id}/ws?token=${encodeURIComponent(token)}&display_name=${encodeURIComponent(displayName)}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      retryCount.current = 0; // successful connect — reset backoff
      startHeartbeat(ws);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "pong") return; // ignore pong keepalives
        handleWsMsg(msg);
      } catch {}
    };

    ws.onclose = () => {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      if (phaseDone.current) return;
      const delay = Math.min(1000 * 2 ** retryCount.current, 30_000); // cap at 30s
      retryCount.current += 1;
      retryTimer.current = setTimeout(connectWs, delay);
    };
  };

  const handleWsMsg = useCallback((msg: any) => {
    const payload = msg.payload ?? msg; // support {type, payload} and flat messages
    switch (msg.type) {
      case "player_joined": {
        const p = payload.participant ?? payload;
        setPlayers((prev) => {
          if (prev.find((x) => x.user_id === p.user_id)) return prev;
          return [...prev, { user_id: p.user_id, display_name: p.display_name, score: 0, xp: 0 }];
        });
        break;
      }
      case "player_left":
        setPlayers((prev) => prev.filter((p) => p.user_id !== (payload.user_id ?? msg.user_id)));
        break;
      case "chat_message":
        setChatMsgs((prev) => [
          ...prev,
          { user: payload.display_name, text: payload.text, time: new Date().toLocaleTimeString() },
        ]);
        break;
      case "phase_change": {
        const newPhase = (payload.phase ?? msg.phase) as Phase | undefined;
        if (newPhase) setPhase(newPhase);
        break;
      }
      case "battle_started":
        setQuizStarted(true);
        setPhase("quiz");
        setTimeLeft(payload.time_limit ?? battle.time_limit_sec ?? 300);
        break;
      case "answer_result": {
        const isCorrect = payload.correct ?? payload.is_correct;
        const ca = msg.correct_answer ?? payload.correct_answer ?? null;
        setCorrect(isCorrect);
        setCorrectAnswer(ca);
        setAnswered(true);
        if (isCorrect) setScore((s) => s + (payload.points ?? 100));
        break;
      }
      case "leaderboard_update": {
        const lb: any[] = payload.leaderboard ?? payload.standings ?? [];
        if (lb.length) {
          setPlayers(
            lb.map((s: any, i: number) => ({
              user_id: s.user_id,
              display_name: s.display_name,
              score: s.score ?? 0,
              xp: s.xp_earned ?? 0,
              rank: i + 1,
            }))
          );
          const mine = lb.find((s: any) => s.user_id === userId);
          if (mine) setScore(mine.score ?? 0);
        }
        break;
      }
      case "battle_finished":
        phaseDone.current = true;
        setResults(payload);
        setPhase("finished");
        break;
    }
  }, [userId, battle.time_limit_sec]);

  useEffect(() => {
    chatScrollRef.current?.scrollToEnd({ animated: true });
  }, [chatMsgs, chatOpen]);

  const sendChat = () => {
    if (!chatInput.trim()) return;
    wsRef.current?.send(JSON.stringify({ type: "chat", payload: { text: chatInput.trim(), display_name: displayName } }));
    setChatMsgs((prev) => [...prev, { user: displayName, text: chatInput.trim(), time: new Date().toLocaleTimeString() }]);
    setChatInput("");
  };

  // ── Discuss phase timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "discuss") return;
    const t = setInterval(() => setDiscussSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // ── Quiz countdown timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "quiz" || !quizStarted) return;
    const t = setInterval(() => setTimeLeft((prev: number) => {
      if (prev <= 1) { clearInterval(t); return 0; }
      return prev - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [phase, quizStarted]);

  useEffect(() => {
    if (phase === "quiz" && quizStarted && !answered) questionStart.current = Date.now();
  }, [currentQ, phase, quizStarted, answered]);

  const goToPhase = (p: Phase) => {
    setPhase(p);
    wsRef.current?.send(JSON.stringify({ type: "phase_change", payload: { phase: p } }));
  };

  const loadVideo = () => {
    const id = extractYoutubeId(videoUrlInput);
    if (!id) {
      Toast.show({ type: "error", text1: "Invalid link", text2: "Paste a valid YouTube video URL." });
      return;
    }
    setVideoId(id);
  };

  const handleStartQuiz = async () => {
    setStarting(true);
    try {
      await battleApi.start(battle.id, userId);
      setQuizStarted(true);
      setPhase("quiz");
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Could not start quiz", text2: e?.response?.data?.detail || "Please try again." });
    } finally {
      setStarting(false);
    }
  };

  const handleAnswer = async (opt: string) => {
    if (answered || isSpectator) return;
    setSelected(opt);
    const timeMs = Date.now() - questionStart.current;
    try {
      const r = await battleApi.submitAnswer(battle.id, userId, {
        battle_id: battle.id,
        question_idx: currentQ,
        answer: opt,
        time_taken_ms: timeMs,
      });
      const isCorrect = r.data.is_correct ?? r.data.correct;
      if (!answered) {
        setCorrect(isCorrect);
        setCorrectAnswer(r.data.correct_answer ?? null);
        setAnswered(true);
        if (isCorrect) setScore((s) => s + (r.data.points ?? 100));
      }
    } catch {}
  };

  const handleNext = () => {
    setSelected(null);
    setCorrect(null);
    setCorrectAnswer(null);
    setAnswered(false);
    if (currentQ + 1 >= totalQ) {
      // Don't jump back to the arena hub here — wait for the 'battle_finished'
      // websocket event (handled above) to reveal the results/standings screen
      // for this specific battle, same as web's GroupBattleFlow.
      battleApi.finish(battle.id).catch(() => {});
    } else {
      setCurrentQ((c) => c + 1);
    }
  };

  const handleReview = () => {
    navigation.navigate("BattleReview", { battleId: battle.id, userId });
  };

  const handleRematch = async () => {
    if (rematching) return;
    setRematching(true);
    try {
      const r = await battleApi.rematch(battle.id, userId, displayName);
      Toast.show({
        type: "success",
        text1: "Rematch created!",
        text2: r.data?.invite_code ? `Share invite code: ${r.data.invite_code}` : "Share the invite with your friends.",
      });
      onExit();
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Could not start rematch", text2: e?.response?.data?.detail || "Please try again." });
    } finally {
      setRematching(false);
    }
  };

  const timerMins = Math.floor(discussSeconds / 60);
  const timerSecs = discussSeconds % 60;
  const discussTimerStr = `${timerMins.toString().padStart(2, "0")}:${timerSecs.toString().padStart(2, "0")}`;

  const quizMins = Math.floor(timeLeft / 60);
  const quizSecs = timeLeft % 60;
  const quizTimerStr = `${quizMins.toString().padStart(2, "0")}:${quizSecs.toString().padStart(2, "0")}`;

  // Finished-phase derived values (mirrors GroupBattleFlow.tsx's 'finished' phase on web)
  const standings: Player[] = results?.participants ?? players;
  const myStanding = standings.find((p) => p.user_id === userId);
  const won = myStanding?.rank === 1 || standings[0]?.user_id === userId;
  const xpEarned = results?.xp_awarded ?? (won ? 500 : 25);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.primary600 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={onExit} style={styles.headerIconBtn}>
            <Ionicons name="arrow-back-outline" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>🎓 Study Party</Text>
            <Text style={styles.headerSub}>
              {battle.subject ?? "General"} · {players.length + 1} people{inviteCode ? ` · Code: ${inviteCode}` : ""}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setChatOpen(true)} style={styles.headerIconBtn}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="rgba(255,255,255,0.9)" />
            {chatMsgs.length > 0 && (
              <View style={styles.chatBadge}>
                <Text style={styles.chatBadgeText}>{chatMsgs.length > 9 ? "9+" : chatMsgs.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Phase tabs */}
        <View style={styles.phaseTabs}>
          {PHASE_TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setPhase(tab.key)}
              style={[styles.phaseTab, phase === tab.key && styles.phaseTabActive]}
            >
              <Text style={[styles.phaseTabText, phase === tab.key && styles.phaseTabTextActive]} numberOfLines={1}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {phase === "lobby" && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="people-outline" size={18} color="#EC4899" />
              <Text style={styles.cardTitle}>Waiting Room</Text>
            </View>

            <View style={styles.playerRow}>
              <View style={[styles.avatar, { backgroundColor: "#FCE7F3" }]}>
                <Text style={[styles.avatarText, { color: "#BE185D" }]}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.playerName}>👑 {displayName} (You)</Text>
              <View style={styles.onlineDot} />
            </View>
            {players.map((p) => (
              <View key={p.user_id} style={styles.playerRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{p.display_name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.playerName}>{p.display_name}</Text>
                <View style={styles.onlineDot} />
              </View>
            ))}

            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>📱 Step 1: Share code {inviteCode ?? "—"} — friends join</Text>
              <Text style={styles.infoBoxText}>🎬 Step 2: Watch a video together</Text>
              <Text style={styles.infoBoxText}>💬 Step 3: Discuss what you learned</Text>
              <Text style={styles.infoBoxText}>⚔️ Step 4: Start a quiz battle!</Text>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => goToPhase("watch")}>
              <Text style={styles.primaryBtnText}>Start Party →</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === "watch" && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="videocam-outline" size={18} color="#EC4899" />
              <Text style={styles.cardTitle}>Sync Watch</Text>
            </View>

            {videoId ? (
              <VideoPlayer youtubeId={videoId} />
            ) : (
              <View style={styles.videoPlaceholder}>
                <Ionicons name="videocam-outline" size={36} color={palette.gray500} />
                <Text style={styles.videoPlaceholderText}>Paste a YouTube video URL to watch together</Text>
              </View>
            )}

            <View style={styles.urlRow}>
              <TextInput
                style={styles.urlInput}
                placeholder="https://youtube.com/watch?v=..."
                placeholderTextColor={palette.gray400}
                value={videoUrlInput}
                onChangeText={setVideoUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.loadBtn} onPress={loadVideo}>
                <Text style={styles.loadBtnText}>Load</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => goToPhase("discuss")}>
              <Text style={styles.primaryBtnText}>Done Watching → Discuss</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === "discuss" && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="chatbubbles-outline" size={18} color="#EC4899" />
              <Text style={styles.cardTitle}>Group Discussion</Text>
            </View>
            <Text style={styles.discussHint}>Discuss what you learned before the quiz battle.</Text>

            <View style={styles.discussTimerBox}>
              <Ionicons name="time-outline" size={16} color="#EC4899" />
              <Text style={styles.discussTimerText}>{discussTimerStr}</Text>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => goToPhase("quiz")}>
              <Ionicons name="flash-outline" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Ready? Start Quiz Battle!</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === "quiz" && !quizStarted && (
          <View style={[styles.card, { alignItems: "center", paddingVertical: 28 }]}>
            <Text style={{ fontSize: 44, marginBottom: 10 }}>⚔️</Text>
            <Text style={styles.quizIntroTitle}>Time to Battle!</Text>
            <Text style={styles.quizIntroSub}>
              All players will compete on the same questions from the video topic.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleStartQuiz} disabled={starting}>
              {starting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Start Battle Now!</Text>}
            </TouchableOpacity>
          </View>
        )}

        {phase === "quiz" && quizStarted && (
          !q ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={palette.primary600} />
            </View>
          ) : (
            <>
              {/* Live score banner — mirrors LiveBattleScreen's live banner */}
              <View style={[styles.liveBanner, { backgroundColor: palette.primary600 }]}>
                <View style={styles.liveCell}>
                  <Text style={styles.liveCellLabel}>Question</Text>
                  <Text style={styles.liveCellValue}>{currentQ + 1}<Text style={styles.liveCellSub}>/{totalQ}</Text></Text>
                </View>
                <View style={styles.liveDivider} />
                <View style={styles.liveCell}>
                  <Text style={styles.liveCellLabel}>Time Left</Text>
                  <Text style={[styles.liveCellValue, timeLeft < 30 && styles.liveCellDanger]}>{quizTimerStr}</Text>
                </View>
                <View style={styles.liveDivider} />
                <View style={styles.liveCell}>
                  <Text style={styles.liveCellLabel}>Your Score</Text>
                  <Text style={styles.liveCellValue}>{score}</Text>
                </View>
              </View>

              {q.subject && (
                <View style={styles.subjectTag}>
                  <Text style={styles.subjectTagText}>{q.subject}{q.topic ? ` · ${q.topic}` : ""}</Text>
                </View>
              )}

              <View style={styles.questionCard}>
                <Text style={styles.questionText}>{q.text}</Text>
              </View>

              {(q.options ?? []).map((opt: string, i: number) => {
                let bgColor: string = "#fff";
                let borderColor: string = palette.gray200;
                let textColor: string = palette.gray800;

                if (answered) {
                  if (opt === correctAnswer) { bgColor = semantic.success.bg; borderColor = semantic.success.solid; textColor = semantic.success.text; }
                  else if (opt === selected && !correct) { bgColor = semantic.danger.bg; borderColor = semantic.danger.solid; textColor = semantic.danger.text; }
                  else { bgColor = palette.gray50; borderColor = palette.gray200; textColor = palette.gray400; }
                } else if (opt === selected) {
                  bgColor = palette.primary50; borderColor = palette.primary600; textColor = palette.primary800;
                }

                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.optionBtn, { backgroundColor: bgColor, borderColor }]}
                    onPress={() => handleAnswer(opt)}
                    disabled={answered || isSpectator}
                  >
                    <Text style={[styles.optionLetter, { color: textColor }]}>{String.fromCharCode(65 + i)}. </Text>
                    <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}

              {answered && (
                <View style={[styles.feedbackRow, { backgroundColor: correct ? semantic.success.bg : semantic.danger.bg, borderColor: correct ? semantic.success.solid : semantic.danger.solid }]}>
                  <Text style={{ fontSize: 20 }}>{correct ? "✅" : "❌"}</Text>
                  <Text style={[styles.feedbackText, { color: correct ? semantic.success.text : semantic.danger.text, flex: 1 }]}>
                    {correct ? "Correct! +100 pts" : `Wrong. Answer: ${correctAnswer ?? "—"}`}
                  </Text>
                  <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
                    <Text style={styles.nextBtnText}>{currentQ + 1 >= totalQ ? "Finish" : "Next →"}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {players.length > 0 && (
                <View style={styles.miniLb}>
                  <Text style={styles.miniLbTitle}>🏆 Live Rankings</Text>
                  {players.slice(0, 6).map((p, i) => (
                    <View key={p.user_id} style={[styles.lbRow, p.user_id === userId && styles.lbRowMe]}>
                      <Text style={[styles.lbRank, i === 0 && { color: palette.warning500 }]}>{i === 0 ? "👑" : `#${i + 1}`}</Text>
                      <Text style={styles.lbName} numberOfLines={1}>{p.display_name}{p.user_id === userId ? " ★" : ""}</Text>
                      <Text style={styles.lbScore}>{p.score}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )
        )}

        {phase === "finished" && (
          <>
            <View style={[styles.card, styles.finishedHero]}>
              <Text style={styles.finishedEmoji}>
                {won ? "🏆" : myStanding?.rank === 2 ? "🥈" : myStanding?.rank === 3 ? "🥉" : "🎮"}
              </Text>
              <Text style={styles.finishedTitle}>{won ? "Victory!" : `Rank #${myStanding?.rank ?? "—"}`}</Text>
              <Text style={styles.finishedScore}>Score: {myStanding?.score ?? score} pts</Text>
              <View style={styles.xpPill}>
                <Ionicons name="flash" size={14} color={palette.warning700} />
                <Text style={styles.xpPillText}>+{xpEarned} XP</Text>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Ionicons name="trophy-outline" size={18} color="#EC4899" />
                <Text style={styles.cardTitle}>Final Standings</Text>
              </View>
              {standings.slice(0, 10).map((p, i) => (
                <View key={p.user_id} style={[styles.lbRow, p.user_id === userId && styles.lbRowMe]}>
                  <Text style={[styles.lbRank, i === 0 && { color: palette.warning500 }]}>{i === 0 ? "👑" : `#${i + 1}`}</Text>
                  <Text style={styles.lbName} numberOfLines={1}>{p.display_name}{p.user_id === userId ? " ★" : ""}</Text>
                  <Text style={styles.lbScore}>{p.score}</Text>
                </View>
              ))}
            </View>

            <View style={styles.finishedBtnRow}>
              <TouchableOpacity style={[styles.primaryBtn, styles.finishedBackBtn]} onPress={onExit}>
                <Text style={styles.primaryBtnText}>Back to Arena</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, styles.finishedReviewBtn]} onPress={handleReview}>
                <Ionicons name="book-outline" size={14} color="#fff" />
                <Text style={styles.primaryBtnText}>Review</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, styles.finishedRematchBtn]} onPress={handleRematch} disabled={rematching}>
                {rematching
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="refresh-outline" size={14} color="#fff" /><Text style={styles.primaryBtnText}>Rematch</Text></>
                }
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Party Chat drawer */}
      <Modal visible={chatOpen} animationType="slide" transparent onRequestClose={() => setChatOpen(false)}>
        <View style={styles.chatOverlay}>
          <TouchableOpacity style={styles.chatBackdrop} activeOpacity={1} onPress={() => setChatOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.chatDrawer}
          >
            <View style={styles.chatHeaderRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#EC4899" />
                <Text style={styles.chatHeaderTitle}>Party Chat</Text>
              </View>
              <TouchableOpacity onPress={() => setChatOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={palette.gray400} />
              </TouchableOpacity>
            </View>

            <ScrollView ref={chatScrollRef} style={styles.chatList} contentContainerStyle={{ paddingVertical: 8 }}>
              {chatMsgs.length === 0 && (
                <Text style={styles.chatEmptyText}>No messages yet. Say hello!</Text>
              )}
              {chatMsgs.map((m, i) => {
                const mine = m.user === displayName;
                return (
                  <View key={i} style={[styles.chatMsgRow, mine && styles.chatMsgRowMine]}>
                    <View style={[styles.chatAvatar, mine && styles.chatAvatarMine]}>
                      <Text style={[styles.chatAvatarText, mine && styles.chatAvatarTextMine]}>
                        {m.user.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={[styles.chatBubble, mine ? styles.chatBubbleMine : styles.chatBubbleOther]}>
                      {!mine && <Text style={styles.chatBubbleName}>{m.user}</Text>}
                      <Text style={[styles.chatBubbleText, mine && styles.chatBubbleTextMine]}>{m.text}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                placeholder="Type a message..."
                placeholderTextColor={palette.gray400}
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={sendChat}
                returnKeyType="send"
              />
              <TouchableOpacity style={styles.chatSendBtn} onPress={sendChat}>
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.gray50 },

  // Header
  header:         { paddingTop: spacing.sm, paddingBottom: 14, paddingHorizontal: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  headerTopRow:   { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerIconBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", position: "relative" },
  headerTitle:    { ...typography.h4, fontSize: 17, fontWeight: "800", color: "#fff" },
  headerSub:      { ...typography.bodySm, fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  chatBadge:      { position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: palette.danger500, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  chatBadgeText:  { fontSize: 9, fontWeight: "800", color: "#fff" },

  phaseTabs:          { flexDirection: "row", gap: spacing.xs + 2, marginTop: spacing.lg },
  phaseTab:           { flex: 1, minHeight: 44, paddingVertical: 7, borderRadius: radius.sm, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  phaseTabActive:     { backgroundColor: "#fff" },
  phaseTabText:       { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
  phaseTabTextActive: { color: palette.primary700 },

  body:        { flex: 1 },
  bodyContent: { padding: spacing.md + 2, gap: spacing.sm + 2, paddingBottom: spacing["3xl"] },

  card:           { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardHeaderRow:  { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  cardTitle:      { ...typography.h4, color: palette.gray800 },

  // Lobby
  playerRow:    { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.xs },
  avatar:       { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  avatarText:   { fontSize: 13, fontWeight: "800", color: palette.gray500 },
  playerName:   { flex: 1, ...typography.bodyMedium, color: palette.gray700 },
  onlineDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.success500 },
  infoBox:      { backgroundColor: "#FDF4FF", borderRadius: radius.sm, padding: spacing.sm + 2, marginTop: spacing.sm + 2, marginBottom: spacing.lg, borderWidth: 1, borderColor: "#F5D0FE", gap: spacing.xs },
  infoBoxText:  { fontSize: 11, color: "#86198F", lineHeight: 16 },

  // "Study Party" accent — a deliberate one-off pink (#EC4899), not part of the
  // shared indigo/gray/semantic palette; kept hardcoded (see report).
  primaryBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: "#EC4899", borderRadius: radius.md + 2, minHeight: 44, paddingVertical: 13 },
  primaryBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  // Watch
  videoPlaceholder:     { aspectRatio: 16 / 9, backgroundColor: palette.gray900, borderRadius: radius.md + 2, alignItems: "center", justifyContent: "center", gap: spacing.sm, marginBottom: spacing.lg, paddingHorizontal: spacing.xl },
  videoPlaceholderText: { fontSize: 12, color: palette.gray400, textAlign: "center" },
  urlRow:         { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, marginTop: spacing.md },
  urlInput:       { flex: 1, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: 12, color: palette.gray800, minHeight: 44 },
  loadBtn:        { backgroundColor: "#EC4899", borderRadius: radius.sm, paddingHorizontal: spacing.lg, minHeight: 44, alignItems: "center", justifyContent: "center" },
  loadBtnText:    { color: "#fff", fontWeight: "700", fontSize: 12 },

  // Discuss
  discussHint:      { fontSize: 12, color: palette.gray500, marginBottom: spacing.lg },
  discussTimerBox:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: "#FDF2F8", borderRadius: radius.md, paddingVertical: spacing.lg, marginBottom: spacing.lg },
  discussTimerText: { fontSize: 22, fontWeight: "800", color: "#BE185D", fontVariant: ["tabular-nums"] },

  // Quiz intro
  quizIntroTitle: { ...typography.h2, marginBottom: spacing.xs + 2 },
  quizIntroSub:   { fontSize: 12, color: palette.gray500, textAlign: "center", marginBottom: spacing["2xl"], paddingHorizontal: spacing.md },

  // Live banner (mirrors LiveBattleScreen)
  liveBanner:       { flexDirection: "row", paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.md + 2 },
  liveCell:         { flex: 1, alignItems: "center" },
  liveCellLabel:    { fontSize: 9, color: "rgba(199,210,254,0.9)", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  liveCellValue:    { fontSize: 18, fontWeight: "800", color: "#fff", marginTop: 2 },
  liveCellSub:      { fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: "600" },
  liveCellDanger:   { color: "#FCA5A5" }, // light danger tint for readability on the dark indigo banner — no clean token match at this exact tint
  liveDivider:      { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: spacing.xs },

  subjectTag:     { backgroundColor: palette.primary50, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, alignSelf: "flex-start" },
  subjectTagText: { fontSize: 11, fontWeight: "600", color: palette.primary600 },
  questionCard:   { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  questionText:   { ...typography.h4, color: palette.gray800, lineHeight: 22 },
  optionBtn:      { borderWidth: 2, borderRadius: radius.md + 2, padding: spacing.md + 2, flexDirection: "row", alignItems: "center", minHeight: 44 },
  optionLetter:   { fontSize: 14, fontWeight: "700", marginRight: spacing.xs },
  optionText:     { fontSize: 14, flex: 1 },
  feedbackRow:    { borderWidth: 1.5, borderRadius: radius.md + 2, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  feedbackText:   { fontSize: 13, fontWeight: "600" },
  nextBtn:        { backgroundColor: palette.primary600, borderRadius: radius.sm, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm - 1, minHeight: 44, justifyContent: "center" },
  nextBtnText:    { color: "#fff", fontSize: 12, fontWeight: "700" },

  miniLb:      { backgroundColor: "#fff", borderRadius: radius.md + 2, padding: spacing.md, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  miniLbTitle: { fontSize: 12, fontWeight: "700", color: palette.gray700, marginBottom: spacing.sm },
  lbRow:       { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs + 1 },
  lbRowMe:     { backgroundColor: palette.primary50, borderRadius: radius.sm, paddingHorizontal: spacing.xs + 2 },
  lbRank:      { width: 24, fontSize: 12, fontWeight: "700", color: palette.gray400 },
  lbName:      { flex: 1, fontSize: 12, color: palette.gray800, fontWeight: "600" },
  lbScore:     { fontSize: 12, fontWeight: "700", color: palette.primary600 },

  // Finished (quiz-complete results screen)
  finishedHero:      { alignItems: "center", paddingVertical: spacing.xl },
  finishedEmoji:      { fontSize: 44, marginBottom: spacing.sm },
  finishedTitle:      { ...typography.h1, fontSize: 20 },
  finishedScore:      { fontSize: 13, color: palette.gray500, marginTop: spacing.xs },
  xpPill:             { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: palette.warning100, borderRadius: radius.pill, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm - 2, marginTop: spacing.sm + 2 },
  xpPillText:         { fontSize: 13, fontWeight: "800", color: palette.warning700 },
  finishedBtnRow:     { flexDirection: "row", gap: spacing.sm },
  finishedBackBtn:    { flex: 1, backgroundColor: palette.primary500 },
  finishedReviewBtn:  { flex: 1, backgroundColor: palette.primary600 },
  finishedRematchBtn: { flex: 1, backgroundColor: palette.success600 },

  // Chat drawer
  chatOverlay:      { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  chatBackdrop:      { ...StyleSheet.absoluteFillObject },
  chatDrawer:        { backgroundColor: "#fff", borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "75%", minHeight: "45%", padding: spacing.lg },
  chatHeaderRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm + 2, paddingBottom: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  chatHeaderTitle:    { fontSize: 14, fontWeight: "700", color: palette.gray800 },
  chatList:           { flex: 1 },
  chatEmptyText:      { fontSize: 12, color: palette.gray400, textAlign: "center", marginTop: spacing["2xl"] },
  chatMsgRow:         { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm + 2, alignItems: "flex-end" },
  chatMsgRowMine:     { flexDirection: "row-reverse" },
  chatAvatar:         { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.gray100, alignItems: "center", justifyContent: "center" },
  chatAvatarMine:     { backgroundColor: "#FCE7F3" },
  chatAvatarText:     { fontSize: 10, fontWeight: "800", color: palette.gray500 },
  chatAvatarTextMine: { color: "#BE185D" },
  chatBubble:         { maxWidth: "75%", borderRadius: radius.md + 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chatBubbleOther:    { backgroundColor: palette.gray100 },
  chatBubbleMine:     { backgroundColor: "#EC4899" },
  chatBubbleName:     { fontSize: 10, fontWeight: "700", color: palette.gray400, marginBottom: 2 },
  chatBubbleText:     { fontSize: 12, color: palette.gray800 },
  chatBubbleTextMine: { color: "#fff" },
  chatInputRow:       { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.sm + 2, borderTopWidth: 1, borderTopColor: palette.gray100 },
  chatInput:          { flex: 1, borderWidth: 1.5, borderColor: palette.gray200, borderRadius: radius.pill, paddingHorizontal: spacing.md + 2, paddingVertical: 9, fontSize: 12, color: palette.gray800, minHeight: 44 },
  chatSendBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: "#EC4899", alignItems: "center", justifyContent: "center" },
});
