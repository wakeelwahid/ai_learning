import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import BackButton from "@/components/ui/BackButton";
import { notificationApi } from "@/lib/api";
import toast from "react-hot-toast";
import {
  Rocket, BookOpen, Brain, Globe, Zap, Users, Star, ArrowRight,
  Mic, TrendingUp, Calendar, Compass, MessageSquare, Trophy,
  Clock, CheckCircle, ChevronUp, Mail, Target, FileText, BarChart2,
  Gift, Home, Sparkles, UserPlus, Map, Shield, Image, Award,
  GraduationCap, DollarSign, PenLine, Calculator, Shuffle,
  FlaskConical, Layers, Bot, BookMarked,
} from "lucide-react";

// ── Upcoming classes ──────────────────────────────────────────────────────────
const UPCOMING_CLASSES = [
  { class: "Class 6", eta: "Q3 2025", icon: "📗", subjects: ["Maths", "Science", "English"] },
  { class: "Class 7", eta: "Q3 2025", icon: "📘", subjects: ["Maths", "Science", "Social Science"] },
  { class: "Class 8", eta: "Q4 2025", icon: "📙", subjects: ["Maths", "Science", "English"] },
  { class: "Class 9", eta: "Q4 2025", icon: "📕", subjects: ["Maths", "Physics", "Chemistry"] },
  { class: "Class 11", eta: "Q1 2026", icon: "🔬", subjects: ["Physics", "Chemistry", "Maths"] },
  { class: "Class 12", eta: "Q1 2026", icon: "🎓", subjects: ["Physics", "Chemistry", "Maths"] },
];

// ── Upcoming subjects ─────────────────────────────────────────────────────────
const UPCOMING_SUBJECTS = [
  { name: "Science", icon: "🔬", color: "bg-green-500" },
  { name: "Physics", icon: "⚛️", color: "bg-blue-500" },
  { name: "Chemistry", icon: "🧪", color: "bg-primary-600" },
  { name: "Biology", icon: "🧬", color: "bg-emerald-500" },
  { name: "Social Science", icon: "🌍", color: "bg-amber-500" },
  { name: "Hindi", icon: "🔤", color: "bg-rose-500" },
];

// ── Upcoming boards ───────────────────────────────────────────────────────────
const UPCOMING_BOARDS = [
  { name: "UP Board", logo: "🏫", desc: "Uttar Pradesh Madhyamik Shiksha Parishad" },
  { name: "Rajasthan Board", logo: "🏜️", desc: "Board of Secondary Education, Rajasthan" },
  { name: "ICSE", logo: "🎓", desc: "Indian Certificate of Secondary Education" },
  { name: "Bihar Board", logo: "📚", desc: "Bihar School Examination Board" },
];

// ── Upcoming AI features ──────────────────────────────────────────────────────
const UPCOMING_AI = [
  { icon: Mic, title: "Voice AI Tutor", desc: "Talk to your AI tutor just like a real teacher", eta: "Q3 2025", color: "bg-purple-100 text-purple-700" },
  { icon: TrendingUp, title: "Exam Prediction", desc: "AI predicts which topics are most likely in exams", eta: "Q4 2025", color: "bg-blue-100 text-blue-700" },
  { icon: Calendar, title: "Smart Study Planner", desc: "Personalized daily study schedule based on exams", eta: "Q4 2025", color: "bg-green-100 text-green-700" },
  { icon: Compass, title: "Career Guidance", desc: "AI-powered career path recommendations", eta: "Q1 2026", color: "bg-orange-100 text-orange-700" },
];

// ── Upcoming learning features ────────────────────────────────────────────────
const UPCOMING_LEARNING = [
  { icon: Users, title: "Live Classes", desc: "Real-time interactive sessions with expert teachers", eta: "Q3 2025" },
  { icon: MessageSquare, title: "Discussion Forum", desc: "Peer-to-peer doubt solving community", eta: "Q3 2025" },
  { icon: Trophy, title: "Olympiad Prep", desc: "Specialized courses for Math & Science Olympiads", eta: "Q4 2025" },
  { icon: Brain, title: "JEE / NEET Foundation", desc: "Early preparation tracks for competitive exams", eta: "Q1 2026" },
];

// ── Phase 2: AI Learning Assistant ───────────────────────────────────────────
const PHASE2_AI = [
  { icon: Target,     title: "AI Weak Topic Coach",        stars: 5, desc: "Automatically identifies weak topics after quizzes and recommends relevant videos, revision notes and practice quizzes.", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { icon: Bot,        title: "AI Doubt Solver",            stars: 5, desc: "Ask syllabus-based questions and receive contextual answers — Explain Trigonometry, solve chapter concepts, clarify theory.", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { icon: FlaskConical, title: "AI Quiz Generator",       stars: 5, desc: "Generate unlimited quizzes by topic, difficulty and question count — Trigonometry Easy, Algebra Medium, Geometry Hard.", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  { icon: BookMarked, title: "AI Revision Notes Generator", stars: 4, desc: "Generate chapter summaries, formula sheets, exam revision notes and important questions on demand.", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { icon: Calendar,   title: "AI Exam Preparation Mode",   stars: 5, desc: "Personalised study plans based on exam date, available study time, weak topics and subject priorities.", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { icon: Layers,     title: "AI Mistake Analysis",        stars: 5, desc: "Detailed explanations for wrong answers — why it was wrong, the correct concept, and recommended revision resources.", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
  { icon: Shuffle,    title: "AI Flashcard Generator",     stars: 4, desc: "Automatically create flashcards from chapters, notes and important concepts for quick revision.", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  { icon: FileText,   title: "AI Mock Test Creator",       stars: 5, desc: "Generate complete exam-style mock tests with board-specific patterns, subject-specific tests and difficulty control.", color: "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400" },
  { icon: BarChart2,  title: "AI Performance Reports",     stars: 5, desc: "Advanced analytics covering strengths, weaknesses, improvement trends and parent-ready performance reports.", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
];

// ── Phase 3: Gamification & Community ────────────────────────────────────────
const PHASE3_GAMIFICATION = [
  { icon: Gift,      title: "Mystery Reward Box",     stars: 5, desc: "Complete activities and unlock surprise rewards — EduPoints, XP Boosters, Premium Content, Special Badges, Profile Frames.", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { icon: Home,      title: "House System",           stars: 5, desc: "Join a learning house (Red, Blue, Green, Yellow). Earn house points through quizzes, battles and daily challenges. Monthly rankings.", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { icon: Sparkles,  title: "Seasonal Events",        stars: 5, desc: "Special learning events every season — Summer Learning Festival, Winter Revision Challenge, Exam Warrior Event with exclusive rewards.", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { icon: UserPlus,  title: "Friend System",          stars: 4, desc: "Send friend requests, view a friend leaderboard, follow activity feeds and challenge friends to battles.", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { icon: Map,       title: "Learning Journey Map",   stars: 4, desc: "Visual progress tracking per subject — see completed topics (✓ Algebra) and locked topics (🔒 Trigonometry) at a glance.", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { icon: Shield,    title: "Streak Freeze",          stars: 4, desc: "Protect your learning streak by spending EduPoints. Maintain momentum, reduce churn and improve engagement.", color: "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400" },
  { icon: Image,     title: "Avatar Collection System", stars: 4, desc: "Unlock profile frames, themes, backgrounds, stickers and titles — Quiz Master, Math Ninja, Battle Champion and more.", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  { icon: Award,     title: "Class Championship",     stars: 5, desc: "Monthly competitions between classes measured by quiz performance, daily challenges, battle wins and XP earned. Win badges and premium access.", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
];

// ── Phase 4: Advanced Learning Ecosystem ────────────────────────────────────
const PHASE4_ADVANCED = [
  { icon: GraduationCap, title: "Teacher Dashboard",      stars: 5, desc: "Teachers create classes, assign quizzes, track individual student progress and download detailed performance reports.", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { icon: DollarSign,    title: "Scholarship Program",    stars: 5, desc: "Monthly rewards for top performers — scholarships, premium access grants and public recognition on the platform.", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { icon: PenLine,       title: "AI Essay Evaluator",     stars: 4, desc: "Automatic essay review with instant feedback on structure, grammar, arguments and improvement suggestions.", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  { icon: Calculator,    title: "AI Math Step Solver",    stars: 5, desc: "Step-by-step mathematical solutions that show every working step so students understand the process, not just the answer.", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { icon: Shuffle,       title: "Personalized Learning Path", stars: 5, desc: "Fully adaptive learning roadmap generated from student performance — the platform learns and adjusts to each student.", color: "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400" },
];

// ── Feature voting ────────────────────────────────────────────────────────────
const VOTE_FEATURES = [
  { id: 1, title: "Dark mode for the app", votes: 342 },
  { id: 2, title: "Offline download for videos", votes: 289 },
  { id: 3, title: "Parent progress SMS alerts", votes: 215 },
  { id: 4, title: "Group study rooms", votes: 198 },
  { id: 5, title: "Multi-language support (Hindi UI)", votes: 167 },
  { id: 6, title: "Print-friendly notes export", votes: 143 },
];

function ETABadge({ eta }: { eta: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" />
      {eta}
    </span>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${color}`}>
      {label}
    </span>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <span className="text-yellow-400 text-xs tracking-tight" title={`Priority: ${count}/5`}>
      {"★".repeat(count)}{"☆".repeat(5 - count)}
    </span>
  );
}

function VoteSection({ votes, voteCounts, onVote }: {
  votes: Record<number, boolean>;
  voteCounts: Record<number, number>;
  onVote: (id: number) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="card">
      <div className="mb-3">
        <p className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-1.5">
          <ChevronUp className="w-4 h-4 text-primary-500" /> {t("voteForFeatures")}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">A quick pulse-check — for a request that really matters to you, tell us via Contact Us</p>
      </div>
      <div className="space-y-2">
        {VOTE_FEATURES.map((f) => (
          <div key={f.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <button
              onClick={() => onVote(f.id)}
              disabled={votes[f.id]}
              className={`flex flex-col items-center min-w-[40px] px-2 py-1.5 rounded-lg border-2 transition-all font-bold text-xs leading-none flex-shrink-0
                ${votes[f.id]
                  ? "border-primary-400 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 cursor-default"
                  : "border-gray-200 dark:border-gray-700 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-700 text-gray-500 cursor-pointer"}`}
            >
              <ChevronUp className="w-3.5 h-3.5 mb-0.5" />
              {voteCounts[f.id]}
            </button>
            <p className="flex-1 text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug">{f.title}</p>
            {votes[f.id] && <CheckCircle className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function BetaSection({ betaEmail, setBetaEmail, betaSubmitted, betaSubmitting, onSubmit }: {
  betaEmail: string;
  setBetaEmail: (v: string) => void;
  betaSubmitted: boolean;
  betaSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="rounded-2xl bg-gray-900 dark:bg-gray-950 border border-gray-800 p-5 text-white">
      <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center mb-3">
        <Rocket className="w-5 h-5 text-white" />
      </div>
      <h3 className="text-sm font-bold mb-1">{t("getEarlyAccess")}</h3>
      <p className="text-xs text-gray-300 mb-4 leading-relaxed">
        Be first to try Voice AI Tutor, Live Classes, and more. Join our beta waitlist.
      </p>
      {betaSubmitted ? (
        <div className="flex items-center gap-2 text-success-400 font-semibold text-xs">
          <CheckCircle className="w-4 h-4" />
          You're on the list! We'll notify you soon.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-2">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="email"
              value={betaEmail}
              onChange={(e) => setBetaEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full pl-9 pr-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 text-xs"
              required
            />
          </div>
          <button
            type="submit"
            disabled={betaSubmitting}
            className="w-full py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-xs flex items-center gap-2 justify-center"
          >
            {betaSubmitting ? "Joining…" : <>Join Beta <ArrowRight className="w-3.5 h-3.5" /></>}
          </button>
        </form>
      )}
      <p className="text-[10px] text-gray-500 mt-3">No spam. Unsubscribe anytime.</p>
    </div>
  );
}

export default function RoadmapPage() {
  const { t } = useLanguage();
  const [votes, setVotes] = useState<Record<number, boolean>>({});
  const [voteCounts, setVoteCounts] = useState<Record<number, number>>(
    Object.fromEntries(VOTE_FEATURES.map((f) => [f.id, f.votes]))
  );
  const [betaEmail, setBetaEmail] = useState("");
  const [betaSubmitted, setBetaSubmitted] = useState(false);
  const [betaSubmitting, setBetaSubmitting] = useState(false);

  // Local-only for this session — not persisted server-side. Feature
  // requests shape our roadmap through direct feedback/support channels;
  // this quick-vote view is illustrative and resets on refresh.
  const handleVote = (id: number) => {
    if (votes[id]) return;
    setVotes((v) => ({ ...v, [id]: true }));
    setVoteCounts((c) => ({ ...c, [id]: c[id] + 1 }));
    toast.success("Thanks for the input!");
  };

  // Beta waitlist signups ARE real — routed through the same Contact Us
  // pipeline (persisted, admin-visible) rather than a dedicated beta-list
  // table, since that's the backend that already exists for "someone gave
  // us an email + a message" submissions.
  const handleBetaSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!betaEmail) return;
    setBetaSubmitting(true);
    try {
      await notificationApi.submitContactMessage({
        name: "Beta waitlist signup",
        email: betaEmail,
        subject: "Beta waitlist",
        message: "Requested early access to Voice AI Tutor, Live Classes, and upcoming features.",
      });
      setBetaSubmitted(true);
      toast.success("You're on the beta list! 🚀");
    } catch {
      toast.error("Could not join the waitlist right now. Please try again.");
    } finally {
      setBetaSubmitting(false);
    }
  };

  return (
    <div className="w-full space-y-6 pb-12 animate-fade-in">
      <BackButton label="Back" />

      {/* ── HERO — full width ── */}
      <div className="rounded-2xl bg-primary-600 p-6 sm:p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1.5" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Rocket className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">{t("productRoadmap")}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">{t("whatsComingNext")}</h1>
          <p className="text-primary-100 text-base sm:text-lg max-w-2xl">
            We're building the most comprehensive AI-powered learning platform for Indian students.
            Here's a peek at what's on our roadmap.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <div className="bg-white/20 rounded-lg px-4 py-2 text-sm font-medium">
              ✅ Available Now: CBSE Class 10 Maths &amp; Science
            </div>
            <div className="bg-white/20 rounded-lg px-4 py-2 text-sm font-medium">
              🔜 Next: 6 More Classes
            </div>
          </div>
        </div>
      </div>

      {/* ── 2-col at xl: left = content, right = sidebar ── */}
      <div className="xl:flex xl:gap-8 xl:items-start">

        {/* ── LEFT MAIN CONTENT ── */}
        <div className="flex-1 min-w-0 space-y-10">

          {/* Upcoming classes */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" /> Upcoming Classes
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">More grade levels with full CBSE curriculum coverage</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {UPCOMING_CLASSES.map((cls) => (
                <div key={cls.class} className="card hover:shadow-md transition-shadow border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{cls.icon}</span>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{cls.class}</h3>
                    </div>
                    <ETABadge eta={cls.eta} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cls.subjects.map((s) => (
                      <span key={s} className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Upcoming subjects */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" /> New Subjects
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">Expanding beyond Maths with full subject coverage</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {UPCOMING_SUBJECTS.map((sub) => (
                <div
                  key={sub.name}
                  className={`rounded-2xl ${sub.color} p-4 text-white text-center hover:scale-105 transition-transform cursor-default`}
                >
                  <div className="text-3xl mb-2">{sub.icon}</div>
                  <p className="text-sm font-semibold">{sub.name}</p>
                  <p className="text-xs text-white/70 mt-0.5">{t("comingSoon")}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Upcoming boards */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Globe className="w-5 h-5 text-green-600" /> More Boards
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">Extending support to State and National boards</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {UPCOMING_BOARDS.map((board) => (
                <div key={board.name} className="card border border-dashed border-gray-300 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-primary-50/50 dark:hover:bg-primary-900/20 transition-all group">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{board.logo}</span>
                    <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-400">{board.name}</h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{board.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Upcoming AI features */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" /> Upcoming AI Features
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">Next-gen AI capabilities to supercharge learning</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {UPCOMING_AI.map((f) => (
                <div key={f.title} className="card flex items-start gap-4 hover:shadow-md transition-shadow">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${f.color}`}>
                    <f.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{f.title}</h3>
                      <ETABadge eta={f.eta} />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* New Learning features */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500" /> New Learning Features
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">Expanding the learning experience beyond videos</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {UPCOMING_LEARNING.map((f) => (
                <div key={f.title} className="card flex items-start gap-4 hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
                    <f.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{f.title}</h3>
                      <ETABadge eta={f.eta} />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Phase 2: AI Learning Assistant ── */}
          <section>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full uppercase tracking-wide">Phase 2</span>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-600" /> AI Learning Assistant
              </h2>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">Intelligent AI tools that personalise every student's learning journey</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PHASE2_AI.map((f) => (
                <div key={f.title} className="card hover:shadow-md transition-shadow border border-gray-100 dark:border-gray-800">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${f.color}`}>
                      <f.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-snug">{f.title}</h3>
                      <Stars count={f.stars} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3">{f.desc}</p>
                  <StatusBadge label={t("comingSoon")} color="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" />
                </div>
              ))}
            </div>
          </section>

          {/* ── Phase 3: Gamification & Community ── */}
          <section>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-3 py-1 rounded-full uppercase tracking-wide">Phase 3</span>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-orange-500" /> Gamification &amp; Community
              </h2>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">Deeper engagement mechanics to make learning addictive and social</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PHASE3_GAMIFICATION.map((f) => (
                <div key={f.title} className="card hover:shadow-md transition-shadow border border-gray-100 dark:border-gray-800">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${f.color}`}>
                    <f.icon className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">{f.title}</h3>
                  <Stars count={f.stars} />
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-2 mb-3">{f.desc}</p>
                  <StatusBadge label={t("comingSoon")} color="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" />
                </div>
              ))}
            </div>
          </section>

          {/* ── Phase 4: Advanced Learning Ecosystem ── */}
          <section>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full uppercase tracking-wide">Phase 4</span>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Rocket className="w-5 h-5 text-blue-600" /> Advanced Learning Ecosystem
              </h2>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">Long-term platform features that complete the full learning experience</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PHASE4_ADVANCED.map((f) => (
                <div key={f.title} className="card hover:shadow-md transition-shadow border border-gray-100 dark:border-gray-800">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${f.color}`}>
                      <f.icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-snug">{f.title}</h3>
                      <Stars count={f.stars} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3">{f.desc}</p>
                  <StatusBadge label="Future Release" color="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" />
                </div>
              ))}
            </div>
          </section>

          {/* Feature voting — mobile/tablet only */}
          <section className="xl:hidden">
            <VoteSection votes={votes} voteCounts={voteCounts} onVote={handleVote} />
          </section>

          {/* Beta Access — mobile/tablet only */}
          <section className="xl:hidden">
            <BetaSection
              betaEmail={betaEmail} setBetaEmail={setBetaEmail}
              betaSubmitted={betaSubmitted} betaSubmitting={betaSubmitting} onSubmit={handleBetaSignup}
            />
          </section>

        </div>{/* end left */}

        {/* ── RIGHT SIDEBAR (xl+) ── */}
        <aside className="hidden xl:flex flex-col w-72 2xl:w-80 flex-shrink-0 sticky top-6 self-start space-y-4">

          {/* Phase timeline */}
          <div className="card">
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">Roadmap Timeline</p>
            <div className="space-y-3">
              {[
                { phase: "Phase 1", label: "Now Live", desc: "CBSE Class 10 · Maths & Science", dot: "bg-green-500", badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
                { phase: "Phase 2", label: "Q3–Q4 2025", desc: "AI Tutor · Smart Planner · Voice AI", dot: "bg-purple-500 animate-pulse", badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
                { phase: "Phase 3", label: "Q4 2025–Q1 2026", desc: "Gamification · Community · Events", dot: "bg-orange-400", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
                { phase: "Phase 4", label: "2026", desc: "Teacher Dashboard · Scholarships · AI Solver", dot: "bg-blue-400", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
              ].map((item, i) => (
                <div key={item.phase} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5 ${item.dot}`} />
                    {i < 3 && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 my-1" />}
                  </div>
                  <div className="pb-3">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-xs font-bold text-gray-900 dark:text-white">{item.phase}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-px rounded-full ${item.badge}`}>{item.label}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature voting */}
          <VoteSection votes={votes} voteCounts={voteCounts} onVote={handleVote} />

          {/* Beta signup */}
          <BetaSection
            betaEmail={betaEmail} setBetaEmail={setBetaEmail}
            betaSubmitted={betaSubmitted} betaSubmitting={betaSubmitting} onSubmit={handleBetaSignup}
          />

        </aside>

      </div>{/* end 2-col */}
    </div>
  );
}
