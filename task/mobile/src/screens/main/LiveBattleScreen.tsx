import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Linking, Dimensions, Share, Image,
} from "react-native";
import Toast from "react-native-toast-message";
import { getAccessToken } from "@/api/secureStorage";
import { battleApi } from "../../api/battle";
import { BASE_URL } from "../../api/client";
import UserAvatar from "@/components/UserAvatar";
import { palette, semantic, radius, spacing, typography, cardShadow } from "@/theme/colors";

const { width } = Dimensions.get("window");

interface Props {
  battle: any;
  userId: string;
  displayName: string;
  isSpectator?: boolean;
  onExit: () => void;
  /** Optional: called with the new battle data after a successful rematch, so the parent can swap to it. */
  onRematch?: (newBattle: any) => void;
}

interface Player {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  score: number;
  xp: number;
  rank?: number;
}

export default function LiveBattleScreen({ battle, userId, displayName, isSpectator = false, onExit, onRematch }: Props) {
  const [phase, setPhase] = useState<"lobby" | "battle" | "finished">("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(battle.time_limit_sec ?? 300);
  const [results, setResults] = useState<any>(null);
  const [starting, setStarting] = useState(false);
  const [rematching, setRematching] = useState(false);
  const questionStart = useRef(0);
  const wsRef        = useRef<WebSocket | null>(null);
  const retryCount   = useRef(0);
  const retryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseDone    = useRef(false);

  // State (not a const) — the host can reroll the set in the lobby, and the
  // server pushes the fresh answer-stripped list via "questions_regenerated".
  const [questions, setQuestions] = useState<any[]>(battle.questions ?? []);
  const [regenerating, setRegenerating] = useState(false);
  const totalQ = questions.length;
  const q = questions[currentQ];
  const isSolo = battle.battle_type === "solo";
  const isHost = battle.host_user_id === userId;

  // WebSocket connection for multiplayer — Phase 10+13: heartbeat + exponential-backoff reconnect
  useEffect(() => {
    if (!isSolo) connectWs();
    return () => {
      phaseDone.current = true;
      cleanupWs();
    };
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
      retryCount.current = 0;   // successful connect — reset backoff
      startHeartbeat(ws);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "pong") return;  // ignore pong keepalives
        handleWsMsg(msg);
      } catch {}
    };

    ws.onclose = (evt) => {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      // Don't reconnect if battle is finished or component unmounted
      if (phaseDone.current) return;
      const delay = Math.min(1000 * 2 ** retryCount.current, 30_000);  // cap at 30s
      retryCount.current += 1;
      retryTimer.current = setTimeout(connectWs, delay);
    };
  };

  // Countdown timer during battle
  useEffect(() => {
    if (phase !== "battle") return;
    const t = setInterval(() => setTimeLeft((prev: number) => {
      if (prev <= 1) { clearInterval(t); return 0; }
      return prev - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "battle" && !answered) questionStart.current = Date.now();
  }, [currentQ, phase]);

  const handleWsMsg = useCallback((msg: any) => {
    const payload = msg.payload ?? msg; // support {type, payload} and flat messages
    switch (msg.type) {
      case "player_joined": {
        const p = payload.participant ?? payload;
        setPlayers((prev) => {
          if (prev.find((x) => x.user_id === p.user_id)) return prev;
          return [...prev, { user_id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url ?? null, score: 0, xp: 0 }];
        });
        break;
      }
      case "player_left":
        setPlayers((prev) => prev.filter((p) => p.user_id !== (payload.user_id ?? msg.user_id)));
        break;
      case "battle_starting":
        // Optional: show countdown toast
        break;
      case "battle_started":
        setPhase("battle");
        setTimeLeft(payload.time_limit ?? battle.time_limit_sec ?? 300);
        break;
      case "answer_result": {
        // Server sends this personally to the answering user — no user_id check needed
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
          setPlayers((prev) =>
            lb.map((s: any, i: number) => ({
              user_id: s.user_id,
              display_name: s.display_name,
              // leaderboard snapshots don't carry avatars — keep the one we know
              avatar_url: s.avatar_url ?? prev.find((x) => x.user_id === s.user_id)?.avatar_url ?? null,
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
      case "questions_regenerated":
        // Host rolled a fresh set in the lobby — replace the local list so
        // everyone answers the same questions the server will grade against.
        setQuestions(payload.questions ?? []);
        Toast.show({ type: "info", text1: "🎲 New questions generated!" });
        break;
      case "battle_finished":
        phaseDone.current = true;   // stop reconnect loop when battle ends
        setResults(payload);
        setPhase("finished");
        break;
    }
  }, [userId, battle.time_limit_sec]);

  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const r = await battleApi.regenerateQuestions(battle.id);
      setQuestions(r.data?.questions ?? []);
      Toast.show({ type: "success", text1: "🎲 New random questions ready!" });
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Could not generate questions",
        text2: e?.response?.data?.detail || "Please try again.",
      });
    } finally {
      setRegenerating(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      await battleApi.start(battle.id, userId);
      if (isSolo) setPhase("battle");
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Could not start battle",
        text2: e?.response?.data?.detail || "Please try again.",
      });
    } finally {
      setStarting(false);
    }
  };

  const handleAnswer = async (opt: string) => {
    if (answered) return;
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
      battleApi.finish(battle.id).catch(() => {});
      if (isSolo) setPhase("finished");
    } else {
      setCurrentQ((c) => c + 1);
    }
  };

  const handleRematch = async () => {
    if (rematching) return;
    setRematching(true);
    try {
      const r = await battleApi.rematch(battle.id, userId, displayName);
      const newBattle = r.data;
      if (onRematch) {
        onRematch(newBattle);
      } else {
        Toast.show({
          type: "success",
          text1: "Rematch created!",
          text2: newBattle?.invite_code ? `Share invite code: ${newBattle.invite_code}` : "Share the invite with your friends.",
        });
        onExit();
      }
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Could not start rematch",
        text2: e?.response?.data?.detail || "Please try again.",
      });
    } finally {
      setRematching(false);
    }
  };

  const timerMins = Math.floor(timeLeft / 60);
  const timerSecs = timeLeft % 60;
  const timerStr = `${timerMins.toString().padStart(2, "0")}:${timerSecs.toString().padStart(2, "0")}`;
  const myRank = players.findIndex((p) => p.user_id === userId) + 1 || null;

  // ── Lobby ────────────────────────────────────────────────────────────────────
  if (phase === "lobby") {
    return (
      <View style={styles.container}>
        <View style={styles.lobbyHero}>
          <Text style={styles.lobbyTitle}>{isSolo ? "⚔️ Solo vs AI" : battle.battle_type === "1v1" ? "⚔️ 1v1 Battle" : "🌐 Group Battle"}</Text>
          <Text style={styles.lobbySub}>{battle.subject} · {battle.difficulty} · {totalQ} questions · {(battle.time_limit_sec ?? 300) / 60}min</Text>
          {battle.invite_code && (
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>Invite Code</Text>
              <Text style={styles.codeText} numberOfLines={1} ellipsizeMode="tail">{battle.invite_code}</Text>
            </View>
          )}
        </View>

        {!isSolo && (
          <ScrollView style={styles.playersList}>
            <Text style={styles.playersTitle}>Players ({players.length + 1})</Text>
            <View style={styles.playerRow}>
              <Text style={styles.playerName}>👑 {displayName} (You)</Text>
              <View style={styles.onlineDot} />
            </View>
            {players.map((p) => (
              <View key={p.user_id} style={styles.playerRow}>
                {p.avatar_url ? (
                  <Image source={{ uri: p.avatar_url }} style={styles.playerAvatar} />
                ) : (
                  <View style={styles.playerAvatarFallback}>
                    <Text style={styles.playerAvatarTxt}>{(p.display_name || "?").charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.playerName}>{p.display_name}</Text>
                <View style={styles.onlineDot} />
              </View>
            ))}
          </ScrollView>
        )}

        {/* Host can reroll the question set once the opponent has joined —
            same subject/topic/difficulty, fresh random questions. */}
        {!isSolo && isHost && players.length >= 1 && (
          <TouchableOpacity style={styles.regenBtn} onPress={handleRegenerate} disabled={regenerating}>
            {regenerating
              ? <ActivityIndicator color={palette.primary600} size="small" />
              : <Text style={styles.regenBtnText}>🎲 Generate Random Questions</Text>}
          </TouchableOpacity>
        )}

        <View style={styles.lobbyBtns}>
          <TouchableOpacity style={styles.exitBtn} onPress={onExit}>
            <Text style={styles.exitBtnText}>Exit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.startBtn} onPress={handleStart} disabled={starting}>
            {starting ? <ActivityIndicator color="#fff" /> : <Text style={styles.startBtnText}>⚡ Start Battle!</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Finished ─────────────────────────────────────────────────────────────────
  if (phase === "finished") {
    const standings: Player[] = results?.participants ?? players;
    const mine = standings.find((p: any) => p.user_id === userId);
    const won = mine?.rank === 1 || standings[0]?.user_id === userId;
    const xpEarned = results?.xp_awarded ?? (won ? 500 : 25);

    return (
      <ScrollView style={styles.container}>
        <View
          style={[styles.resultHero, { backgroundColor: won ? palette.warning500 : palette.primary600 }]}
        >
          <Text style={styles.resultEmoji}>{won ? "🏆" : mine?.rank === 2 ? "🥈" : mine?.rank === 3 ? "🥉" : "🎮"}</Text>
          <Text style={styles.resultTitle}>{won ? "Victory!" : `Rank #${mine?.rank ?? "—"}`}</Text>
          <Text style={styles.resultScore}>Score: {mine?.score ?? score} pts</Text>
          <View style={styles.xpBadge}>
            <Text style={styles.xpText}>⚡ +{xpEarned} XP earned</Text>
          </View>
        </View>

        <View style={styles.standingsCard}>
          <Text style={styles.standingsTitle}>🏆 Final Standings</Text>
          {standings.slice(0, 10).map((p: any, i: number) => (
            <View key={p.user_id} style={[styles.standingRow, p.user_id === userId && styles.standingRowMe]}>
              <Text style={[styles.rankNum, i === 0 && { color: palette.warning500 }]}>
                {i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
              </Text>
              <UserAvatar userId={p.user_id} name={p.display_name} uri={p.avatar_url} size={26} style={{ marginRight: 6 }} />
              <Text style={styles.standingName}>{p.display_name}{p.user_id === userId ? " ★" : ""}</Text>
              <Text style={styles.standingScore}>{p.score} pts</Text>
              <Text style={styles.standingXp}>+{p.xp ?? 0}XP</Text>
            </View>
          ))}
        </View>

        {won && (() => {
          const shareText =
            `🏆 I just won a ${battle.subject ?? "quiz"} Battle on EduLearn!\n` +
            `Score: ${mine?.score ?? score} pts · +${xpEarned} XP · Think you can beat me? Join: https://edulearn.app`;
          const enc = encodeURIComponent(shareText);
          const open = (url: string) =>
            Linking.canOpenURL(url).then((ok) => {
              if (ok) Linking.openURL(url);
              else Share.share({ message: shareText }).catch(() => {});
            });
          return (
            <View style={styles.waShareCard}>
              <View style={styles.waShareHeader}>
                <Text style={styles.waShareIcon}>📲</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.waShareTitle}>Share your Victory!</Text>
                  <Text style={styles.waShareSub}>WhatsApp · Facebook · Telegram · Instagram & more</Text>
                </View>
              </View>
              <View style={styles.socialRow}>
                <TouchableOpacity style={[styles.socialBtn, { backgroundColor: "#22C55E" }]}
                  onPress={() => open(`https://wa.me/?text=${enc}`)}>
                  <Text style={styles.socialBtnTxt}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.socialBtn, { backgroundColor: "#1877F2" }]}
                  onPress={() => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://edulearn.app")}&quote=${enc}`)}>
                  <Text style={styles.socialBtnTxt}>Facebook</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.socialRow}>
                <TouchableOpacity style={[styles.socialBtn, { backgroundColor: "#229ED9" }]}
                  onPress={() => open(`https://t.me/share/url?url=${encodeURIComponent("https://edulearn.app")}&text=${enc}`)}>
                  <Text style={styles.socialBtnTxt}>Telegram</Text>
                </TouchableOpacity>
                {/* Native share sheet — includes Instagram (Stories/DM), X, etc. */}
                <TouchableOpacity style={[styles.socialBtn, { backgroundColor: palette.gray600 }]}
                  onPress={() => Share.share({ message: shareText }).catch(() => {})}>
                  <Text style={styles.socialBtnTxt}>Instagram / More…</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        <View style={styles.finishedBtnRow}>
          <TouchableOpacity style={styles.rematchBtn} onPress={handleRematch} disabled={rematching}>
            {rematching ? <ActivityIndicator color={palette.primary600} /> : <Text style={styles.rematchBtnText}>🔁 Rematch</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.backBtn, styles.finishedBackBtn]} onPress={onExit}>
            <Text style={styles.backBtnText}>Back to Arena</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  // ── Battle ────────────────────────────────────────────────────────────────────
  if (!q) return <View style={styles.center}><ActivityIndicator color={palette.primary600} /></View>;

  const progress = totalQ > 0 ? (currentQ + (answered ? 1 : 0)) / totalQ : 0;

  return (
    <View style={styles.container}>
      {/* Live score banner */}
      <View style={styles.liveBanner}>
        <View style={styles.liveCell}>
          <Text style={styles.liveCellLabel}>Question</Text>
          <Text style={styles.liveCellValue}>{currentQ + 1}<Text style={styles.liveCellSub}>/{totalQ}</Text></Text>
        </View>
        <View style={styles.liveDivider} />
        <View style={styles.liveCell}>
          <Text style={styles.liveCellLabel}>Time Left</Text>
          <Text style={[styles.liveCellValue, timeLeft < 30 && styles.liveCellDanger]}>{timerStr}</Text>
        </View>
        <View style={styles.liveDivider} />
        <View style={styles.liveCell}>
          <Text style={styles.liveCellLabel}>Your Score</Text>
          <Text style={styles.liveCellValue}>{score}</Text>
        </View>
        <View style={styles.liveDivider} />
        <View style={styles.liveCell}>
          <Text style={styles.liveCellLabel}>Rank</Text>
          <Text style={styles.liveCellValue}>{myRank ? `#${myRank}` : "—"}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.battleContent}>
        {/* Spectator banner */}
        {isSpectator && (
          <View style={styles.spectatorBanner}>
            <Text style={styles.spectatorBannerText}>👁 Spectating — you can watch but not answer</Text>
          </View>
        )}

        {/* Subject/topic tag */}
        {q.subject && (
          <View style={styles.subjectTag}>
            <Text style={styles.subjectTagText}>{q.subject}{q.topic ? ` · ${q.topic}` : ""}</Text>
          </View>
        )}

        {/* Question */}
        <View style={styles.questionCard}>
          <Text style={styles.questionText}>{q.text}</Text>
        </View>

        {/* Options */}
        {(q.options ?? []).map((opt: string, i: number) => {
          let bgColor: string = "#fff";
          let borderColor: string = palette.gray200;
          let textColor: string = palette.gray800;

          if (answered) {
            if (opt === correctAnswer) { bgColor = semantic.success.bg; borderColor = palette.success500; textColor = semantic.success.text; }
            else if (opt === selected && !correct) { bgColor = semantic.danger.bg; borderColor = palette.danger500; textColor = semantic.danger.text; }
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
          <View style={[styles.feedbackRow, { backgroundColor: correct ? semantic.success.bg : semantic.danger.bg, borderColor: correct ? palette.success500 : palette.danger500 }]}>
            <Text style={{ fontSize: 20 }}>{correct ? "✅" : "❌"}</Text>
            <Text style={[styles.feedbackText, { color: correct ? semantic.success.text : semantic.danger.text, flex: 1 }]}>
              {correct ? "Correct! +100 pts" : `Wrong. Answer: ${correctAnswer ?? "—"}`}
            </Text>
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextBtnText}>{currentQ + 1 >= totalQ ? "Finish" : "Next →"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Live leaderboard */}
        {!isSolo && (
          <View style={styles.miniLb}>
            <Text style={styles.miniLbTitle}>🏆 Live Rankings</Text>
            {/* Show self if not in list yet */}
            {!players.find((p) => p.user_id === userId) && (
              <View style={[styles.lbRow, styles.lbRowMe]}>
                <Text style={styles.lbRank}>—</Text>
                <Text style={styles.lbName} numberOfLines={1}>{displayName} ★</Text>
                <Text style={styles.lbScore}>{score}</Text>
              </View>
            )}
            {players.slice(0, 6).map((p, i) => (
              <View key={p.user_id} style={[styles.lbRow, p.user_id === userId && styles.lbRowMe]}>
                <Text style={[styles.lbRank, i === 0 && { color: palette.warning500 }]}>{i === 0 ? "👑" : `#${i + 1}`}</Text>
                {p.avatar_url ? (
                  <Image source={{ uri: p.avatar_url }} style={styles.lbAvatarImg} />
                ) : null}
                <Text style={styles.lbName} numberOfLines={1}>{p.display_name}{p.user_id === userId ? " ★" : ""}</Text>
                <Text style={styles.lbScore}>{p.score}</Text>
              </View>
            ))}
            {players.length === 0 && (
              <Text style={{ fontSize: typography.bodySm.fontSize, color: palette.gray400, textAlign: "center", paddingVertical: spacing.sm }}>Waiting for answers...</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.gray50 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Lobby
  lobbyHero: { padding: spacing["3xl"], alignItems: "center", borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, backgroundColor: palette.primary600 },
  lobbyTitle: { fontSize: typography.h2.fontSize, fontFamily: typography.h2.fontFamily, fontWeight: "800", color: "#fff" },
  lobbySub: { fontSize: typography.bodySm.fontSize, color: palette.primary200, marginTop: 4 },
  codeBox: { marginTop: spacing.lg, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radius.lg, paddingHorizontal: spacing["2xl"], paddingVertical: spacing.md, alignItems: "center" },
  codeLabel: { fontSize: 11, color: palette.primary200, fontWeight: "600", textTransform: "uppercase" },
  codeText: { fontSize: width < 300 ? 20 : 28, fontWeight: "900", color: "#fff", letterSpacing: width < 300 ? 3 : 8 },
  playersList: { padding: spacing.lg, maxHeight: 240 },
  playersTitle: { fontSize: typography.bodyMedium.fontSize, fontFamily: typography.bodyMedium.fontFamily, fontWeight: "700", color: palette.gray700, marginBottom: spacing.sm },
  playerRow: { backgroundColor: "#fff", borderRadius: radius.sm, padding: spacing.sm, marginBottom: 6, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  playerAvatar: { width: 28, height: 28, borderRadius: 14 },
  playerAvatarFallback: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.primary50, alignItems: "center", justifyContent: "center" },
  playerAvatarTxt: { fontSize: 12, fontWeight: "800", color: palette.primary600 },
  playerName: { flex: 1, fontSize: typography.bodyMedium.fontSize, color: palette.gray800, fontWeight: "600" },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.success500 },
  lobbyBtns: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  regenBtn: { marginHorizontal: spacing.lg, marginTop: 4, paddingVertical: spacing.md, minHeight: 44, borderRadius: radius.md, backgroundColor: palette.primary50, borderWidth: 1.5, borderColor: palette.primary200, alignItems: "center", justifyContent: "center" },
  regenBtnText: { color: palette.primary600, fontWeight: "700", fontSize: typography.body.fontSize },
  exitBtn: { flex: 1, backgroundColor: palette.gray100, borderRadius: radius.lg, paddingVertical: spacing.md, minHeight: 44, alignItems: "center", justifyContent: "center" },
  exitBtnText: { fontSize: typography.body.fontSize, fontWeight: "600", color: palette.gray700 },
  startBtn: { flex: 2, backgroundColor: palette.primary600, borderRadius: radius.lg, paddingVertical: spacing.md, minHeight: 44, alignItems: "center", justifyContent: "center" },
  startBtnText: { fontSize: typography.body.fontSize, fontWeight: "700", color: "#fff" },

  // Result
  resultHero: { padding: spacing["4xl"], alignItems: "center" },
  resultEmoji: { fontSize: 56, marginBottom: spacing.sm },
  resultTitle: { fontSize: 26, fontWeight: "900", color: "#fff" },
  resultScore: { fontSize: typography.bodyLg.fontSize, color: "rgba(255,255,255,0.8)", marginTop: 4 },
  xpBadge: { marginTop: spacing.md, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: radius.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  xpText: { fontSize: typography.bodyLg.fontSize, fontWeight: "700", color: "#fff" },
  standingsCard: { margin: spacing.lg, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, ...cardShadow },
  standingsTitle: { fontSize: typography.h4.fontSize, fontFamily: typography.h4.fontFamily, fontWeight: "700", color: palette.gray800, marginBottom: spacing.md },
  standingRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  standingRowMe: { backgroundColor: palette.primary50, borderRadius: radius.sm, paddingHorizontal: spacing.sm },
  rankNum: { width: 28, fontSize: typography.bodyMedium.fontSize, fontWeight: "700", color: palette.gray400 },
  standingName: { flex: 1, fontSize: typography.bodyMedium.fontSize, color: palette.gray800, fontWeight: "600" },
  standingScore: { fontSize: typography.bodyMedium.fontSize, fontWeight: "700", color: palette.primary600, marginRight: spacing.sm },
  standingXp: { fontSize: 11, fontWeight: "700", color: palette.warning500 },
  backBtn: { marginHorizontal: spacing.lg, backgroundColor: palette.primary600, borderRadius: radius.lg, paddingVertical: spacing.md, minHeight: 44, alignItems: "center", justifyContent: "center" },
  backBtnText: { color: "#fff", fontSize: typography.bodyLg.fontSize, fontWeight: "700" },
  finishedBtnRow: { flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg },
  finishedBackBtn: { flex: 1, marginHorizontal: 0 },
  rematchBtn: { flex: 1, backgroundColor: palette.primary50, borderRadius: radius.lg, paddingVertical: spacing.md, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: palette.primary600 },
  rematchBtnText: { color: palette.primary600, fontSize: typography.bodyLg.fontSize, fontWeight: "700" },
  waShareCard: { margin: spacing.lg, marginBottom: spacing.sm, backgroundColor: semantic.success.bg, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.success100 },
  waShareHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  waShareIcon: { fontSize: 28 },
  waShareTitle: { fontSize: typography.bodyMedium.fontSize, fontFamily: typography.bodyMedium.fontFamily, fontWeight: "800", color: semantic.success.text },
  waShareSub: { fontSize: 11, color: palette.success700, marginTop: 2 },
  waShareBtn: { backgroundColor: palette.success600, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  waShareBtnTxt: { color: "#fff", fontSize: typography.bodyLg.fontSize, fontWeight: "700" },
  socialRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  // NOTE: WhatsApp/Facebook/Telegram button backgrounds keep their real
  // third-party brand hex (inline, not tokenized) — these are external-service
  // brand colors, not app UI accents, so they are a deliberate exception to
  // the single-accent rule (see JSX above). Minimum 44pt tap height below.
  socialBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 11, minHeight: 44, alignItems: "center", justifyContent: "center" },
  socialBtnTxt: { color: "#fff", fontSize: typography.bodyMedium.fontSize, fontWeight: "700" },

  // Live banner
  liveBanner: { flexDirection: "row", paddingVertical: spacing.md, paddingHorizontal: spacing.sm, backgroundColor: palette.primary600 },
  liveCell: { flex: 1, alignItems: "center" },
  liveCellLabel: { fontSize: 9, color: "rgba(199,210,254,0.9)", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  liveCellValue: { fontSize: 18, fontWeight: "800", color: "#fff", marginTop: 2 },
  liveCellSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: "600" },
  liveCellDanger: { color: "#FCA5A5" },
  liveDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 4 },

  progressBg: { height: 3, backgroundColor: palette.gray200 },
  progressFill: { height: 3, backgroundColor: palette.primary400 },

  // Battle
  battleContent: { padding: spacing.md, gap: spacing.sm },
  spectatorBanner: { borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: palette.gray50, borderWidth: 1, borderStyle: "dashed", borderColor: palette.gray200 },
  spectatorBannerText: { fontSize: typography.bodyMedium.fontSize, fontWeight: "600", color: palette.gray500, textAlign: "center" },
  subjectTag: { backgroundColor: palette.primary50, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, alignSelf: "flex-start" },
  subjectTagText: { fontSize: 11, fontWeight: "600", color: palette.primary600 },
  questionCard: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, ...cardShadow },
  questionText: { fontSize: typography.h4.fontSize, fontWeight: "600", color: palette.gray800, lineHeight: 22 },
  optionBtn: { borderWidth: 2, borderRadius: radius.lg, padding: spacing.md, minHeight: 44, flexDirection: "row", alignItems: "center" },
  optionLetter: { fontSize: typography.body.fontSize, fontWeight: "700", marginRight: 4 },
  optionText: { fontSize: typography.body.fontSize, flex: 1 },
  feedbackRow: { borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  feedbackText: { fontSize: typography.bodyMedium.fontSize, fontWeight: "600" },
  nextBtn: { backgroundColor: palette.primary600, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 32 },
  nextBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  // Leaderboard
  miniLb: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, ...cardShadow },
  miniLbTitle: { fontSize: typography.bodyMedium.fontSize, fontWeight: "700", color: palette.gray700, marginBottom: spacing.sm },
  lbRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5, gap: 6 },
  lbAvatarImg: { width: 20, height: 20, borderRadius: 10 },
  lbRowMe: { backgroundColor: palette.primary50, borderRadius: radius.sm, paddingHorizontal: 6 },
  lbRank: { width: 24, fontSize: 12, fontWeight: "700", color: palette.gray400 },
  lbName: { flex: 1, fontSize: 12, color: palette.gray800, fontWeight: "600" },
  lbScore: { fontSize: 12, fontWeight: "700", color: palette.primary600 },
});
