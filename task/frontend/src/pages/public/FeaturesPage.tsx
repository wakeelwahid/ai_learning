import { Link } from "react-router-dom";
import { Brain, Video, Zap, Trophy, BarChart2, Shield, Globe, BookOpen, Star, Clock } from "lucide-react";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { Card, Button } from "@/components/ui";

const FEATURES = [
  {
    icon: Video, title: "1,200+ NCERT Video Lessons",
    points: ["Chapter-by-chapter NCERT solutions from Class 1–12", "Expert teachers with proven track records", "Available in English, Hindi, Punjabi & Bhojpuri", "HD quality, optimised for mobile data"],
  },
  {
    icon: Brain, title: "24/7 AI Tutor",
    points: ["Ask any doubt in natural language, anytime", "Step-by-step explanations tailored to your level", "10 questions/day on Free, unlimited on Premium", "Understands NCERT context and syllabus"],
  },
  {
    icon: Zap, title: "Adaptive Quizzes & Practice",
    points: ["Questions that adapt to your weak areas automatically", "Chapter-wise MCQs aligned with CBSE pattern", "Previous year CBSE question papers included", "Instant feedback with detailed explanations"],
  },
  {
    icon: Trophy, title: "Leaderboards & Battles",
    points: ["Earn XP points for every video watched and quiz taken", "Compete on class-wise and school-wide leaderboards", "Live 1v1 and group quiz battles with friends", "Streak rewards for consistent daily study"],
  },
  {
    icon: BarChart2, title: "Progress Analytics",
    points: ["Chapter-wise progress tracking across all subjects", "Weekly performance reports with trend analysis", "Time-on-task tracking and study streak calendar", "Identify weak topics before your exam"],
  },
  {
    icon: Shield, title: "Parent Dashboard",
    points: ["Real-time monitoring of study time and activity", "Quiz scores and progress by subject", "Set daily screen-time and content limits", "Direct messaging with teachers (coming soon)"],
  },
  {
    icon: BookOpen, title: "AI Revision Engine",
    points: ["Personalized revision plans based on your quiz history", "Spaced repetition scheduling for maximum retention", "Auto-identifies topics you're likely to forget", "Perfect for last-week-before-exam revision"],
  },
  {
    icon: Star, title: "Certificates",
    points: ["Downloadable PDF certificates for completed modules", "Verifiable via unique certificate ID", "Shareable on WhatsApp, LinkedIn, and email", "Builds a record of academic achievement"],
  },
  {
    icon: Globe, title: "Multilingual Support",
    points: ["Full platform interface in English and Hindi", "Video lessons in English, Hindi, Punjabi, Bhojpuri", "Language preference saved per subject", "More languages being added regularly"],
  },
  {
    icon: Clock, title: "Mobile App",
    points: ["Available on Android and iOS", "Offline video downloads (Premium)", "Push notifications for study reminders", "Synced progress across all devices"],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <SEOHead
        title="Features — Everything in EduLearn"
        description="Explore all EduLearn features — AI tutor, 1,200+ NCERT videos, adaptive quizzes, leaderboards, parent dashboard, multilingual support, and more."
        canonical="/features"
      />

      <div className="bg-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <h1 className="text-3xl font-bold mb-3">Every tool a student needs to succeed</h1>
          <p className="text-primary-100 text-base max-w-2xl mx-auto">One platform replaces videos, tuitions, practice apps, and progress trackers. Here's everything you get.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Breadcrumb items={[{ label: "Features", href: "/features" }]} />

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(f => (
            <Card key={f.title}>
              <div className="w-11 h-11 bg-primary-600 rounded-xl flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{f.title}</h2>
              <ul className="space-y-2">
                {f.points.map(p => (
                  <li key={p} className="flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <span className="text-primary-600 dark:text-primary-400 font-bold flex-shrink-0 mt-0.5">✓</span> {p}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <div className="mt-14 rounded-2xl bg-primary-600 p-8 text-white text-center">
          <h2 className="text-xl font-semibold mb-2">All features, free to try</h2>
          <p className="text-primary-100 mb-5 text-sm">Start with our free plan and upgrade anytime. No credit card required.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to="/register">
              <Button variant="secondary">Get started free</Button>
            </Link>
            <Link to="/pricing">
              <button className="btn bg-white/20 text-white font-medium hover:bg-white/30 border border-white/30 px-4 py-2 text-sm rounded-xl transition-all">
                View pricing
              </button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
