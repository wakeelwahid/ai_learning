import { Link } from "react-router-dom";
import { BookOpen, Brain, Zap, Trophy, BarChart2, ChevronRight } from "lucide-react";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { Card, Button } from "@/components/ui";

const SECTIONS = [
  {
    id: "getting-started", icon: BookOpen, title: "Getting Started",
    items: [
      { heading: "1. Create your account", body: "Go to /register, pick your role (Student or Parent), enter your class/grade, and choose your preferred language. The whole process takes under 60 seconds." },
      { heading: "2. Set your class and board", body: "After sign-up, select your class (1–12) and board (CBSE/NCERT). This customises your dashboard to show your exact syllabus and relevant content." },
      { heading: "3. Pick your language", body: "EduLearn supports English, Hindi, Punjabi, and Bhojpuri. You can choose a different language per subject — for example, English for Maths and Hindi for History." },
    ],
  },
  {
    id: "videos", icon: BookOpen, title: "Watching Video Lessons",
    items: [
      { heading: "Finding a video", body: "Navigate to Learn → select your Subject → Chapter → Exercise → Question. Each exercise question has a dedicated video solution. Use the search bar to jump straight to a topic." },
      { heading: "Video languages", body: "Tap the language selector (top-right of the video player) to switch between available language versions of the same video." },
      { heading: "Offline access", body: "Premium users can download videos for offline watching on the mobile app. Downloads are managed in your Library tab." },
    ],
  },
  {
    id: "ai-tutor", icon: Brain, title: "Using the AI Tutor",
    items: [
      { heading: "How to ask a question", body: "Tap 'Ask AI' from your dashboard or the AI Assistant page. Type your question in plain language — e.g. 'Explain why √2 is irrational' or 'Help me solve this trigonometry problem'." },
      { heading: "Follow-up questions", body: "The AI remembers context within a conversation. If the first explanation isn't clear, ask a follow-up: 'Can you explain that in simpler terms?' or 'Show me a worked example'." },
      { heading: "Question limits", body: "Free plan: 10 AI questions per day. Premium plan: unlimited questions. Your daily limit resets at midnight (Indian Standard Time)." },
    ],
  },
  {
    id: "quizzes", icon: Zap, title: "Practice Quizzes",
    items: [
      { heading: "Chapter quizzes", body: "After watching a video, use the practice questions to test your understanding. Each question comes with the correct answer and a detailed explanation." },
      { heading: "Adaptive mode", body: "The AI identifies which topics you're struggling with and automatically serves more practice on those areas. Your accuracy per topic is shown in your Progress dashboard." },
      { heading: "Previous year papers", body: "Access CBSE Class 10 and 12 previous year papers (2013–2024) under the PYPs section. These are marked and timed." },
    ],
  },
  {
    id: "leaderboard", icon: Trophy, title: "Leaderboards & Battles",
    items: [
      { heading: "Earning XP points", body: "Earn XP by watching videos (5 XP/video), taking quizzes (10–25 XP per quiz), maintaining streaks (bonus XP daily), and completing chapters." },
      { heading: "Live battles", body: "Challenge another student to a 1v1 quiz battle or join a group battle under the Battle section. Both participants answer the same set of questions under a time limit." },
      { heading: "Streak freezes", body: "Missed a day? You can use a Streak Freeze (earned by reaching 100 XP) to protect your streak once per week." },
    ],
  },
  {
    id: "analytics", icon: BarChart2, title: "Progress & Analytics",
    items: [
      { heading: "Weekly report", body: "Every Monday, you receive a Weekly Report showing: study time, quizzes completed, accuracy per subject, XP earned, and your position on the leaderboard." },
      { heading: "Parent monitoring", body: "Parents can view their linked child's weekly report, chapter progress, study time heatmap, and set daily limits from the Parent Dashboard." },
      { heading: "Certificates", body: "Complete all chapters in a subject module to earn a downloadable PDF certificate. Access earned certificates in your Profile → Certificates tab." },
    ],
  },
];

export default function DocsPage() {
  return (
    <>
      <SEOHead
        title="Documentation — How to Use EduLearn"
        description="Complete guide to using EduLearn — account setup, watching NCERT videos, AI tutor, quizzes, leaderboards, parent controls, and progress tracking."
        canonical="/docs"
      />

      <div className="bg-gray-900 dark:bg-gray-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <h1 className="text-3xl sm:text-3xl font-bold mb-3">Documentation</h1>
          <p className="text-gray-400 text-base sm:text-base">Everything you need to get the most out of EduLearn.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Breadcrumb items={[{ label: "Docs", href: "/docs" }]} />

        {/* Quick nav */}
        <nav className="mt-8 flex flex-wrap gap-2">
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`}
              className="text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-full hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
              {s.title}
            </a>
          ))}
        </nav>

        <div className="mt-10 space-y-14">
          {SECTIONS.map(section => (
            <section key={section.id} id={section.id} className="scroll-mt-20">
              <div className="flex items-center gap-3 mb-6 pb-3 border-b border-gray-100 dark:border-gray-800">
                <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <section.icon className="w-4.5 h-4.5 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{section.title}</h2>
              </div>
              <div className="space-y-4">
                {section.items.map(item => (
                  <Card key={item.heading}>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{item.heading}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{item.body}</p>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 bg-primary-50 dark:bg-primary-900/20 rounded-2xl p-7 flex flex-col sm:flex-row items-center justify-between gap-5 border border-primary-100 dark:border-primary-800">
          <div>
            <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">Still need help?</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Our support team answers most queries within 24 hours.</p>
          </div>
          <div className="flex gap-3 flex-shrink-0 w-full sm:w-auto">
            <Link to="/faq" className="flex-1 sm:flex-none">
              <Button variant="secondary" className="w-full sm:w-auto">
                FAQ <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
            <Link to="/contact" className="flex-1 sm:flex-none">
              <Button variant="primary" className="w-full sm:w-auto">
                Contact support
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
