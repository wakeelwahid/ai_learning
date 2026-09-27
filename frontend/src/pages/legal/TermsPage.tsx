import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card } from "@/components/ui";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: `By accessing or using EduAI ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service. These terms apply to all users, including students, parents, and administrators.`,
  },
  {
    title: "2. Account Registration",
    body: `You must provide accurate, complete, and current information when creating an account. You are responsible for maintaining the confidentiality of your login credentials and for all activities under your account. Notify us immediately at support@eduai.app if you suspect unauthorised access.`,
  },
  {
    title: "3. Eligibility",
    body: `The Service is designed for students enrolled in classes 6–12 and their parents or guardians. Users under the age of 13 must have verifiable parental consent before creating an account. By registering, you confirm that either you are 13 or older, or a parent/guardian is creating the account on your behalf.`,
  },
  {
    title: "4. Use of the Service",
    body: `You may use the Service solely for personal, non-commercial educational purposes. You agree not to:\n• Share your account credentials with others.\n• Upload, post, or transmit any content that is unlawful, harmful, or infringes on third-party rights.\n• Attempt to reverse-engineer, hack, or disrupt any part of the Service.\n• Use AI features to generate or distribute academic dishonesty material.`,
  },
  {
    title: "5. Intellectual Property",
    body: `All content on EduAI — including video lessons, notes, quizzes, AI responses, and software — is owned by EduAI or its licensors and is protected by copyright and other intellectual property laws. You may not reproduce, distribute, or create derivative works without written permission.`,
  },
  {
    title: "6. Subscriptions and Payments",
    body: `Certain features require a paid subscription. Subscription fees are billed in advance on a monthly or annual basis. All payments are non-refundable except as required by applicable law. We reserve the right to modify pricing with 30 days' notice to active subscribers.`,
  },
  {
    title: "7. AI-Generated Content",
    body: `EduAI uses artificial intelligence to provide personalised study assistance. AI-generated answers are based on uploaded syllabus content and are provided for educational guidance only. They may contain errors. Always verify important information with a qualified teacher or official source.`,
  },
  {
    title: "8. Privacy",
    body: `Your privacy is important to us. Our Privacy Policy, which is incorporated into these Terms by reference, describes how we collect, use, and protect your personal data. Please review it carefully before using the Service.`,
  },
  {
    title: "9. Termination",
    body: `We may suspend or terminate your account at any time for violations of these Terms. You may delete your account at any time from your Profile settings. Upon termination, your access to paid content will cease immediately.`,
  },
  {
    title: "10. Disclaimers",
    body: `The Service is provided "as is" without warranties of any kind. EduAI does not guarantee specific academic results or exam scores. To the maximum extent permitted by law, EduAI is not liable for any indirect, incidental, or consequential damages arising from your use of the Service.`,
  },
  {
    title: "11. Governing Law",
    body: `These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in New Delhi, India.`,
  },
  {
    title: "12. Changes to Terms",
    body: `We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance. We will notify active users of material changes via email or in-app notice.`,
  },
  {
    title: "13. Contact Us",
    body: `For questions about these Terms, contact us at:\nEduAI Support\nEmail: legal@eduai.app\nAddress: New Delhi, India`,
  },
];

export default function TermsPage() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-primary-600 text-white">
        <div className="w-full px-4 sm:px-6 py-8">
          <Link to="/login" className="inline-flex items-center gap-2 text-primary-200 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {t("back")}
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-bold text-lg">EduAI</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t("termsOfService")}</h1>
          <p className="text-primary-200 text-sm mt-2">Last updated: June 2026</p>
        </div>
      </div>

      {/* Content */}
      <div className="w-full px-4 sm:px-6 py-10">
        <div className="xl:flex xl:gap-8 xl:items-start">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <Card className="mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                Welcome to EduAI. These Terms of Service govern your access to and use of our educational platform,
                including our website, mobile applications, and AI-powered learning tools. Please read them carefully.
              </p>
            </Card>
            <div className="space-y-4">
              {SECTIONS.map((s) => (
                <Card key={s.title} id={`section-${s.title.split(".")[0]}`}>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">{s.title}</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{s.body}</p>
                </Card>
              ))}
            </div>
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-8">
              © 2026 EduAI. All rights reserved.{" "}
              <Link to="/privacy" className="text-primary-600 dark:text-primary-400 hover:underline">{t("privacyPolicy")}</Link>
            </p>
          </div>

          {/* TOC sidebar (xl+) */}
          <aside className="hidden xl:flex flex-col w-64 2xl:w-72 flex-shrink-0 sticky top-6 self-start">
            <Card>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Contents</p>
              <ul className="space-y-1.5">
                {SECTIONS.map((s) => (
                  <li key={s.title}>
                    <a
                      href={`#section-${s.title.split(".")[0]}`}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors leading-snug block py-0.5"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
