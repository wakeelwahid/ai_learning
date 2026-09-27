import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import SEOHead from "@/components/seo/SEOHead";
import Breadcrumb from "@/components/seo/Breadcrumb";
import { contentApi } from "@/lib/api";
import { Button } from "@/components/ui";

const FAQS: { category: string; items: { q: string; a: string }[] }[] = [
  {
    category: "General",
    items: [
      { q: "What is EduLearn?",           a: "EduLearn is India's AI-powered learning platform for Class 1–12 students. We offer NCERT video solutions, a 24/7 AI tutor, adaptive quizzes, and live leaderboards in English, Hindi, Punjabi, and Bhojpuri." },
      { q: "Which classes does EduLearn cover?", a: "EduLearn covers full NCERT curriculum from Class 1 through Class 12, including all major subjects — Mathematics, Science, Physics, Chemistry, Biology, English, Hindi, and Social Science." },
      { q: "Is EduLearn aligned with the CBSE syllabus?", a: "Yes. All content follows the CBSE/NCERT syllabus. Our video solutions are chapter-by-chapter from official NCERT textbooks used in CBSE schools across India." },
      { q: "Can I use EduLearn to prepare for JEE and NEET?", a: "Yes. While EduLearn is primarily built around the NCERT curriculum (which forms 80–90% of JEE/NEET syllabus), our content for Class 11–12 Physics, Chemistry, and Biology is especially useful for JEE/NEET aspirants." },
    ],
  },
  {
    category: "Content & Features",
    items: [
      { q: "How many video lessons are available?",       a: "Over 1,200 video lessons are available covering all NCERT chapters. Free users can access 100+ selected videos; Premium users get full access." },
      { q: "What languages are the videos available in?", a: "Videos are available in English, Hindi, Punjabi, and Bhojpuri. You can choose your preferred language in settings." },
      { q: "How does the AI Tutor work?",                a: "The AI tutor is a 24/7 chatbot powered by advanced AI. Ask any doubt in natural language — it explains concepts, solves problems step by step, and adapts to your level. Free users get 10 questions/day; Premium users get unlimited access." },
      { q: "What is the AI Revision engine?",           a: "The AI Revision engine analyzes your quiz performance and identifies your weakest topics. It then creates a personalized revision schedule using spaced repetition to maximize your retention before exams." },
      { q: "Can I download certificates?",              a: "Yes — Premium users earn verifiable certificates when they complete a subject module. These can be downloaded as PDF and shared." },
    ],
  },
  {
    category: "Pricing & Billing",
    items: [
      { q: "Is EduLearn free?",           a: "Yes, there is a free tier with access to 100+ selected videos, 10 AI questions/day, and basic quizzes. Premium (₹199/month) unlocks everything." },
      { q: "Is there a free trial?",      a: "New Premium users get a 7-day free trial. No credit card is required to start the trial." },
      { q: "Can I cancel anytime?",       a: "Yes. Cancel anytime from your Subscription page. You keep Premium access until the end of your current billing period — no questions asked." },
      { q: "What payment methods do you accept?", a: "UPI apps (PhonePe, Google Pay, Paytm, Amazon Pay, BHIM), net banking, debit/credit cards (Visa, Mastercard, RuPay), and popular wallets — all via Cashfree." },
      { q: "Is there an annual plan?",    a: "Yes — quarterly and annual plans work out cheaper per month than paying monthly. See current pricing for each duration inside the app after sign-up." },
    ],
  },
  {
    category: "Technical",
    items: [
      { q: "Does EduLearn work on mobile?",       a: "Yes. EduLearn has a dedicated mobile app for Android and iOS. You can also use the web platform on any mobile browser. The mobile app supports offline video downloads (Premium only)." },
      { q: "Can parents monitor their child?",    a: "Yes. Parents can create a separate parent account, link their child's account, and access the Parent Dashboard — which shows study time, quiz scores, progress, and allows setting screen-time limits." },
      { q: "Is my data safe?",                    a: "Yes. We use industry-standard encryption for all data. We never sell personal data to third parties. See our Privacy Policy for full details." },
      { q: "Do I need to create an account to browse?", a: "You can browse our public course listings and blog without an account. An account is needed to watch videos, use the AI tutor, and track progress." },
    ],
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": FAQS.flatMap(cat => cat.items.map(item => ({
    "@type": "Question",
    "name": item.q,
    "acceptedAnswer": { "@type": "Answer", "text": item.a }
  })))
};

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-primary-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-3">
          {a}
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  // Fetch CMS data — fall back to static FAQS if not yet seeded
  const { data: cmsPage } = useQuery({
    queryKey: ["cms", "faq"],
    queryFn: () => contentApi.infoPage("faq").then(r => r.data).catch(() => null),
    staleTime: 5 * 60 * 1000,
  });

  // CMS data can be flat {items:[{q,a}]} or grouped {categories:[{name,items}]}
  const activeFAQs: typeof FAQS = (() => {
    if (!cmsPage?.data) return FAQS;
    if (Array.isArray(cmsPage.data.categories)) return cmsPage.data.categories;
    if (Array.isArray(cmsPage.data.items)) {
      return [{ category: "Frequently Asked Questions", items: cmsPage.data.items }];
    }
    return FAQS;
  })();

  return (
    <>
      <SEOHead
        title="FAQ — Frequently Asked Questions"
        description="Answers to common questions about EduLearn — pricing, content, AI tutor, languages, mobile app, parent controls, and more."
        canonical="/faq"
        jsonLd={jsonLd}
      />

      <div className="bg-primary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <h1 className="text-3xl font-bold mb-3">Frequently Asked Questions</h1>
          <p className="text-primary-100 text-base">Everything you need to know about EduLearn.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Breadcrumb items={[{ label: "FAQ", href: "/faq" }]} />

        <div className="mt-8 space-y-10">
          {activeFAQs.map(cat => (
            <section key={cat.category}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-100 dark:border-gray-800">
                {cat.category}
              </h2>
              <div className="space-y-3">
                {cat.items.map(item => <AccordionItem key={item.q} {...item} />)}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 bg-primary-50 dark:bg-primary-900/20 rounded-2xl p-7 text-center border border-primary-100 dark:border-primary-800">
          <p className="text-base font-semibold text-gray-900 dark:text-white mb-2">Still have questions?</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Our support team is here to help.</p>
          <Link to="/contact">
            <Button variant="primary">Contact us</Button>
          </Link>
        </div>
      </div>
    </>
  );
}
