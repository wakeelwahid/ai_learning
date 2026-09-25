import { Link } from "react-router-dom";
import {
  Brain, Video, Trophy, Zap, CheckCircle, ChevronRight,
  Star, Users, BookOpen, BarChart2, Shield,
} from "lucide-react";
import SEOHead from "@/components/seo/SEOHead";
import { BLOG_POSTS } from "@/data/blog-posts";

const STATS = [
  { value: "50,000+", label: "Active Students" },
  { value: "1,200+",  label: "Video Lessons"   },
  { value: "Class 1–12", label: "Full Coverage" },
  { value: "4",       label: "Languages"        },
];

const FEATURES = [
  { icon: Brain,    title: "AI Tutor",          desc: "Ask any doubt 24/7. Our AI explains concepts in simple language, tailored to your level.",                color: "bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400" },
  { icon: Video,    title: "Video Lessons",     desc: "Expert-taught NCERT video solutions in English, Hindi, Punjabi, and Bhojpuri.",                         color: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
  { icon: Zap,      title: "Adaptive Quizzes",  desc: "Practice questions that adapt to your weak areas. Get stronger every day.",                              color: "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { icon: Trophy,   title: "Leaderboards",      desc: "Earn XP, climb the leaderboard, and challenge friends in live quiz battles.",                           color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { icon: BarChart2,title: "Progress Tracking", desc: "Detailed weekly reports so you always know exactly where you stand.",                                   color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
  { icon: Shield,   title: "Parent Dashboard",  desc: "Parents can monitor study time, progress, and set screen-time limits.",                                color: "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400" },
];

const STEPS = [
  { n: "01", title: "Sign up free",        desc: "Create your account in 30 seconds. Pick your class, board, and language preference." },
  { n: "02", title: "Watch & learn",       desc: "Access video solutions for every NCERT exercise. Pause, rewind, and re-watch anytime." },
  { n: "03", title: "Practice & improve",  desc: "Take adaptive quizzes, ask the AI tutor, and track your improvement week by week." },
];

const TESTIMONIALS = [
  { name: "Priya Sharma", class: "Class 12, Delhi", text: "I was struggling with Calculus and Integration. The AI tutor explained it better than my coaching institute. I scored 94% in Maths this year!", avatar: "P" },
  { name: "Rahul Verma",  class: "Class 10, Lucknow", text: "The video solutions are so clear! I used to spend hours on a single NCERT problem. Now I understand it in minutes. My boards improved from 73% to 89%.", avatar: "R" },
  { name: "Anjali Singh", class: "Class 9, Chandigarh", text: "The leaderboard and battles make studying actually fun. I don't even realise I'm studying for 2–3 hours a day.", avatar: "A" },
];

const SUBJECTS = [
  { name: "Mathematics",  classes: "Class 1–12", emoji: "📐" },
  { name: "Science",      classes: "Class 6–10", emoji: "🔬" },
  { name: "Physics",      classes: "Class 11–12",emoji: "⚛️" },
  { name: "Chemistry",    classes: "Class 11–12",emoji: "🧪" },
  { name: "Biology",      classes: "Class 11–12",emoji: "🧬" },
  { name: "English",      classes: "Class 1–12", emoji: "📖" },
  { name: "Hindi",        classes: "Class 1–12", emoji: "ह" },
  { name: "Social Sci.",  classes: "Class 6–10", emoji: "🌍" },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "EduLearn",
  "url": "https://edulearn.app",
  "description": "India's #1 AI-powered learning platform for Class 1–12 NCERT curriculum.",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "INR",
    "description": "Free access to basic NCERT content and AI tutoring"
  }
};

export default function LandingPage() {
  const recentPosts = BLOG_POSTS.slice(0, 3);

  return (
    <>
      <SEOHead
        title="EduLearn — AI-Powered Learning for Class 1–12 Students"
        description="India's #1 AI-powered NCERT learning platform. Master Class 1–12 with video lessons, AI tutoring, adaptive quizzes & leaderboards. Start free today."
        canonical="/"
        jsonLd={jsonLd}
      />

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-primary-600 text-white">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <span className="inline-block bg-white/20 text-white text-xs font-semibold px-4 py-1.5 rounded-full mb-6 tracking-wide">
            🎉 Trusted by 50,000+ students across India
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6">
            Master NCERT with<br />
            <span className="text-warning-300">AI-Powered Learning</span>
          </h1>
          <p className="text-lg sm:text-xl text-primary-100 max-w-2xl mx-auto mb-10">
            Expert video lessons, 24/7 AI tutoring, and adaptive quizzes for every chapter of Class 1–12. In English, Hindi, Punjabi, and Bhojpuri.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="px-8 py-3.5 bg-white text-primary-700 font-bold rounded-2xl hover:bg-primary-50 transition-colors text-base shadow-md">
              Start learning free →
            </Link>
            <Link to="/courses" className="px-8 py-3.5 bg-white/15 text-white font-semibold rounded-2xl hover:bg-white/25 transition-colors text-base border border-white/30">
              Browse courses
            </Link>
          </div>
          <p className="text-primary-200 text-sm mt-5">No credit card required · Free forever for basic access</p>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <section className="bg-primary-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center text-white">
          {STATS.map(s => (
            <div key={s.label}>
              <p className="text-2xl sm:text-3xl font-extrabold">{s.value}</p>
              <p className="text-primary-200 text-sm mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">Everything you need to score higher</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-3 max-w-xl mx-auto">One platform for videos, AI tutoring, quizzes, and progress tracking — no need for multiple apps or expensive tuitions.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link to="/features" className="inline-flex items-center gap-2 text-primary-600 font-semibold hover:gap-3 transition-all text-sm">
              See all features <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────── */}
      <section className="py-20 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white text-center mb-12">Start improving in 3 steps</h2>
          <div className="grid sm:grid-cols-3 gap-10 relative">
            {STEPS.map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 bg-primary-600 text-white rounded-2xl flex items-center justify-center text-xl font-extrabold mx-auto mb-4 shadow-md">
                  {s.n}
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Subjects ──────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white text-center mb-3">Full NCERT syllabus covered</h2>
          <p className="text-center text-gray-500 dark:text-gray-400 mb-10">All subjects, all chapters, Class 1 through Class 12.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {SUBJECTS.map(s => (
              <Link key={s.name} to="/courses" className="group bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className="w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center text-xl mb-3">{s.emoji}</div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{s.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.classes}</p>
              </Link>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link to="/courses" className="inline-flex items-center gap-2 bg-primary-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-primary-700 transition-colors">
              View all courses <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────── */}
      <section className="py-20 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white text-center mb-12">Students who levelled up</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-5 italic">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">{t.avatar}</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.class}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Blog Preview ──────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white">From our blog</h2>
            <Link to="/blog" className="flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:gap-3 transition-all">All articles <ChevronRight className="w-4 h-4" /></Link>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {recentPosts.map(p => (
              <Link key={p.slug} to={`/blog/${p.slug}`} className="group bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
                <div className={`h-28 bg-gradient-to-br ${p.coverColor} flex items-center justify-center`}>
                  <BookOpen className="w-10 h-10 text-white/30" />
                </div>
                <div className="p-5">
                  <span className="text-xs text-primary-600 dark:text-primary-400 font-semibold">{p.category}</span>
                  <p className="text-sm font-bold text-gray-900 dark:text-white mt-1 line-clamp-2 group-hover:text-primary-600 transition-colors leading-snug">{p.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ────────────────────────────────────────── */}
      <section className="py-20 bg-white dark:bg-gray-950">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-4">Transparent, affordable pricing</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8">Start free. Upgrade when you're ready. No hidden fees.</p>
          <div className="grid sm:grid-cols-2 gap-6 text-left">
            <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-7">
              <p className="font-bold text-lg text-gray-900 dark:text-white mb-1">Free</p>
              <p className="text-3xl font-extrabold text-gray-900 dark:text-white mb-5">₹0 <span className="text-base font-normal text-gray-400">/ month</span></p>
              {["Access to selected videos", "10 AI questions/day", "Basic quizzes", "Leaderboard access"].map(f => (
                <div key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mb-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" /> {f}
                </div>
              ))}
              <Link to="/register" className="block mt-6 text-center font-semibold text-primary-600 border-2 border-primary-200 rounded-xl py-2.5 hover:border-primary-400 transition-colors text-sm">
                Get started free
              </Link>
            </div>
            <div className="rounded-2xl border-2 border-primary-500 bg-primary-600 p-7 text-white relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-warning-400 text-gray-900 text-xs font-bold px-3 py-1 rounded-full">MOST POPULAR</span>
              <p className="font-bold text-lg mb-1">Premium</p>
              <p className="text-3xl font-extrabold mb-5">₹199 <span className="text-base font-normal text-primary-200">/ month</span></p>
              {["All videos unlocked", "Unlimited AI tutor", "All subjects & classes", "Certificates", "AI Revision tool", "Priority support"].map(f => (
                <div key={f} className="flex items-center gap-2 text-sm text-primary-100 mb-2">
                  <CheckCircle className="w-4 h-4 text-warning-300 flex-shrink-0" /> {f}
                </div>
              ))}
              <Link to="/pricing" className="block mt-6 text-center font-semibold bg-white text-primary-700 rounded-xl py-2.5 hover:bg-primary-50 transition-colors text-sm">
                See full pricing →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────── */}
      <section className="py-20 bg-primary-600 text-white text-center">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Ready to start scoring higher?</h2>
          <p className="text-primary-200 mb-8 text-lg">Join 50,000+ students who improved their grades with EduLearn. It's free to get started.</p>
          <Link to="/register" className="inline-flex items-center gap-2 bg-white text-primary-700 font-bold px-8 py-4 rounded-2xl hover:bg-primary-50 transition-colors text-base shadow-md">
            <Users className="w-5 h-5" /> Create free account
          </Link>
          <p className="text-primary-300 text-sm mt-4">No credit card · Takes 30 seconds</p>
        </div>
      </section>
    </>
  );
}
