import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Lock, PlayCircle } from "lucide-react";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { Card } from "@/components/ui";

const CLASS_GROUPS = ["All", "Class 1–5", "Class 6–8", "Class 9–10", "Class 11–12"];

// Cover tint is a single solid brand color (indigo) for every subject card —
// per the design system, no per-item decorative gradients/hues.
const COURSES = [
  { subject: "Mathematics",     emoji: "📐", classes: ["Class 1–5","Class 6–8","Class 9–10","Class 11–12"], videos: 320, free: true,  desc: "Full NCERT Maths — Number systems, Algebra, Geometry, Trigonometry, Calculus and more." },
  { subject: "Science",         emoji: "🔬", classes: ["Class 6–8","Class 9–10"],                          videos: 210, free: true,  desc: "NCERT General Science — Physics, Chemistry & Biology combined for Class 6–10." },
  { subject: "Physics",         emoji: "⚛️", classes: ["Class 11–12"],                                     videos: 185, free: false, desc: "Class 11–12 Physics — Mechanics, Electrostatics, Optics, Modern Physics, and more." },
  { subject: "Chemistry",       emoji: "🧪", classes: ["Class 11–12"],                                     videos: 170, free: false, desc: "Class 11–12 Chemistry — Physical, Organic & Inorganic with reaction mechanisms." },
  { subject: "Biology",         emoji: "🧬", classes: ["Class 11–12"],                                     videos: 155, free: false, desc: "Class 11–12 Biology — Cell Biology, Genetics, Ecology, Human Physiology, NEET prep." },
  { subject: "English",         emoji: "📖", classes: ["Class 1–5","Class 6–8","Class 9–10","Class 11–12"], videos: 140, free: true,  desc: "NCERT English — Grammar, Writing, Literature prose & poetry explanations." },
  { subject: "Hindi",           emoji: "ह",  classes: ["Class 1–5","Class 6–8","Class 9–10","Class 11–12"], videos: 130, free: true,  desc: "NCERT Hindi — Vasant, Durva, Sanchayan, Aroh, Vitan with chapter-wise explanations." },
  { subject: "Social Science",  emoji: "🌍", classes: ["Class 6–8","Class 9–10"],                          videos: 160, free: true,  desc: "History, Geography, Civics and Economics — Chapter-wise video solutions." },
  { subject: "Computer Science",emoji: "💻", classes: ["Class 9–10","Class 11–12"],                        videos:  90, free: false, desc: "CS Class 9–12 — Python, Database, Networking, OOP, CBSE practical guide." },
  { subject: "Sanskrit",        emoji: "📜", classes: ["Class 6–8","Class 9–10"],                          videos:  70, free: true,  desc: "NCERT Sanskrit — Ruchira grammar, translation, and unseen passage practice." },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "EduLearn Courses — NCERT Class 1–12",
  "url": "https://edulearn.app/courses",
  "itemListElement": COURSES.map((c, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "name": `${c.subject} — NCERT ${c.classes.join(", ")}`,
    "url": "https://edulearn.app/register"
  }))
};

export default function CoursesPage() {
  const [group, setGroup] = useState("All");

  const filtered = group === "All"
    ? COURSES
    : COURSES.filter(c => c.classes.some(cl => cl === group));

  return (
    <>
      <SEOHead
        title="Courses — NCERT Class 1–12 Subjects"
        description="Browse all NCERT courses on EduLearn. Maths, Science, Physics, Chemistry, Biology, English, Hindi and more — Class 1 to Class 12, in multiple languages."
        canonical="/courses"
        jsonLd={jsonLd}
      />

      {/* Hero */}
      <div className="bg-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">All NCERT Courses</h1>
          <p className="text-primary-100 text-lg max-w-xl">Expert video lessons for every subject and chapter — Class 1 through Class 12. Start free, no account needed to browse.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Breadcrumb items={[{ label: "Courses", href: "/courses" }]} />

        {/* Class filter */}
        <div className="flex flex-wrap gap-2 mt-6 mb-8">
          {CLASS_GROUPS.map(g => (
            <button key={g} onClick={() => setGroup(g)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                group === g ? "bg-primary-600 text-white border-primary-600" : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary-300 hover:text-primary-600"
              }`}>
              {g}
            </button>
          ))}
        </div>

        {/* Course grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(c => (
            <Card key={c.subject} hover noPadding className="overflow-hidden flex flex-col">
              {/* Cover */}
              <div className="h-28 bg-primary-600 flex items-center justify-between px-6">
                <div>
                  <span className="text-3xl">{c.emoji}</span>
                  <p className="text-white font-bold text-lg mt-1">{c.subject}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/80 text-sm font-semibold">{c.videos}+ videos</p>
                  {c.free
                    ? <span className="text-xs bg-white/25 text-white px-2 py-0.5 rounded-full mt-1 inline-block">Free access</span>
                    : <span className="text-xs bg-white/25 text-white px-2 py-0.5 rounded-full mt-1 inline-block flex items-center gap-1"><Lock className="w-3 h-3" /> Premium</span>
                  }
                </div>
              </div>

              <div className="p-5 flex flex-col flex-1">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {c.classes.map(cl => (
                    <span key={cl} className="text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">{cl}</span>
                  ))}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed flex-1">{c.desc}</p>
                <Link to="/register" className="mt-4 flex items-center gap-2 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:gap-3 transition-all">
                  <PlayCircle className="w-4 h-4" /> Start watching free
                </Link>
              </div>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-14 rounded-2xl bg-primary-600 p-8 text-white text-center">
          <h2 className="text-xl font-bold mb-2">Unlock all courses with Premium</h2>
          <p className="text-primary-100 mb-5 text-sm">From ₹199/month. Full access to 1,200+ videos, unlimited AI tutor, and all subjects.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to="/register" className="bg-white text-primary-700 font-semibold px-6 py-2.5 rounded-xl hover:bg-primary-50 transition-colors text-sm">Start free</Link>
            <Link to="/pricing" className="bg-white/20 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-white/30 transition-colors text-sm border border-white/30">See pricing <ChevronRight className="w-4 h-4 inline" /></Link>
          </div>
        </div>
      </div>
    </>
  );
}
