import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Heart, Target, Lightbulb, Globe } from "lucide-react";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { contentApi } from "@/lib/api";
import { Card } from "@/components/ui";

// Decorative icon tints for the "What we stand for" grid — kept as a single
// neutral+primary pairing (no scattered accent colors): primary for the
// brand-relevant value, neutral gray for the rest.
const VALUES = [
  { icon: Heart,     color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",     title: "Student First",    desc: "Every decision we make is evaluated by one question: does this help students learn better?" },
  { icon: Target,    color: "bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400", title: "Outcome-Driven",   desc: "We measure success by students' exam scores and confidence — not just platform usage." },
  { icon: Lightbulb, color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",title: "Always Innovating", desc: "We combine the latest AI research with proven pedagogy to build tools that genuinely work." },
  { icon: Globe,     color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300", title: "Accessible to All", desc: "Quality education shouldn't depend on where you live or what your parents earn. We keep prices low and our free tier generous." },
];

// Team avatar tints — single brand tone (primary) instead of a scattered
// rainbow of per-person accent colors.
const TEAM = [
  { name: "Arjun Mehta",   role: "Co-founder & CEO",     avatar: "A", bg: "bg-primary-600" },
  { name: "Priya Kapoor",  role: "Co-founder & CTO",     avatar: "P", bg: "bg-primary-600" },
  { name: "Vikram Singh",  role: "Head of Academics",    avatar: "V", bg: "bg-primary-600" },
  { name: "Neha Agarwal",  role: "Head of AI/ML",        avatar: "N", bg: "bg-primary-600" },
  { name: "Rahul Sharma",  role: "Head of Design",       avatar: "R", bg: "bg-primary-600" },
  { name: "Anjali Gupta",  role: "Head of Operations",   avatar: "G", bg: "bg-primary-600" },
];

export default function AboutPage() {
  const { data: cms } = useQuery({
    queryKey: ["cms", "about"],
    queryFn: () => contentApi.infoPage("about").then(r => r.data).catch(() => null),
    staleTime: 5 * 60 * 1000,
  });

  const activeTeam  = cms?.data?.team   ?? TEAM;
  const activeValues = cms?.data?.values ?? VALUES;

  return (
    <>
      <SEOHead
        title="About EduLearn — Our Mission & Team"
        description="EduLearn was built to make quality NCERT education accessible to every student in India — regardless of city, school, or income. Learn about our mission, story, and team."
        canonical="/about"
      />

      <div className="bg-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">We believe every student deserves a great education</h1>
          <p className="text-primary-100 text-lg max-w-2xl">EduLearn was built to close the gap between urban coaching centres and students everywhere else in India.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Breadcrumb items={[{ label: "About", href: "/about" }]} />

        {/* Story */}
        <section className="mt-10 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Our story</h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
              EduLearn started in 2024 when our founders — former IIT and IIM graduates — noticed a stark inequality. Students in metro cities had access to high-quality coaching, recorded video courses, and personalized tutors. Students in smaller cities and rural India had none of that, despite following the same NCERT syllabus.
            </p>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
              We asked: what if every student — from Ludhiana to Lucknow, from Patna to Pune — had access to the same quality of education as students in top coaching institutes? With AI, that's now possible.
            </p>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              Today, 50,000+ students across India use EduLearn daily. Our AI tutor has answered over 2 million questions. And we're just getting started.
            </p>
          </div>
          <div className="bg-primary-600 rounded-2xl p-8 text-white text-center">
            <p className="text-5xl font-bold mb-2">50K+</p>
            <p className="text-primary-100 mb-6">Students learning daily</p>
            <p className="text-5xl font-bold mb-2">2M+</p>
            <p className="text-primary-100 mb-6">AI questions answered</p>
            <p className="text-5xl font-bold mb-2">94%</p>
            <p className="text-primary-100">Students report improved grades</p>
          </div>
        </section>

        {/* Mission */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 text-center">Our mission</h2>
          <p className="text-center text-gray-500 dark:text-gray-400 max-w-2xl mx-auto text-base leading-relaxed">
            To make world-class NCERT education accessible to every student in India — in their language, at their pace, at a price they can afford — by combining the best human expertise with the power of AI.
          </p>
        </section>

        {/* Values */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">What we stand for</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {activeValues.map((v: typeof VALUES[0]) => (
              <Card key={v.title}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${v.color}`}>
                  <v.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{v.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{v.desc}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Team */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">The team</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            {activeTeam.map((t: typeof TEAM[0]) => (
              <Card key={t.name} className="text-center">
                <div className={`w-14 h-14 ${t.bg} text-white rounded-2xl flex items-center justify-center font-bold text-xl mx-auto mb-3`}>{t.avatar}</div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{t.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t.role}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="mt-14 rounded-2xl bg-primary-600 p-8 text-white text-center">
          <h2 className="text-xl font-bold mb-2">Join us on the mission</h2>
          <p className="text-primary-100 mb-5 text-sm">Start learning for free — no credit card, no commitment.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to="/register" className="bg-white text-primary-700 font-semibold px-6 py-2.5 rounded-xl hover:bg-primary-50 transition-colors text-sm">Get started free</Link>
            <Link to="/contact" className="bg-white/20 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-white/30 transition-colors text-sm border border-white/30">Contact us</Link>
          </div>
        </div>
      </div>
    </>
  );
}
