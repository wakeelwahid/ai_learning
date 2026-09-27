import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card } from "@/components/ui";

const SECTIONS = [
  {
    title: "1. Information We Collect",
    body: `When you use EduAI, we collect:\n\n**Account Information:** Name, email address, phone number, role (student/parent), and password (hashed).\n\n**Usage Data:** Videos watched, quizzes attempted, AI queries, study streaks, and learning progress.\n\n**Device Information:** Device type, operating system, browser type, IP address, and app version.\n\n**Payment Information:** We use third-party processors (Cashfree). We do not store full card or bank details on our servers.`,
  },
  {
    title: "2. How We Use Your Information",
    body: `We use your information to:\n• Provide, personalise, and improve the learning experience.\n• Track your academic progress and generate performance insights.\n• Power AI-based study assistance tailored to your syllabus.\n• Send important notifications about your account and new features.\n• Process subscription payments and manage your plan.\n• Detect and prevent fraud or Terms of Service violations.\n• Comply with legal obligations.`,
  },
  {
    title: "3. Information Sharing",
    body: `We do not sell your personal data. We may share information with:\n\n**Service Providers:** Cloud hosting (AWS/GCP), analytics, and payment processors under strict data processing agreements.\n\n**Parents/Guardians:** A linked parent account can view their child's study activity, progress, and performance summaries.\n\n**Legal Requirements:** We may disclose information if required by law, court order, or to protect the rights and safety of our users.`,
  },
  {
    title: "4. Children's Privacy",
    body: `EduAI serves students, including those under 13. We comply with applicable children's privacy laws including the DPDP Act (India) and COPPA (USA) where applicable.\n\n• We collect only the minimum data necessary for educational purposes.\n• Parental consent is required for students under 13.\n• Parents can review, update, or request deletion of their child's data at any time by contacting us.`,
  },
  {
    title: "5. Data Security",
    body: `We implement industry-standard security measures including:\n• HTTPS encryption for all data in transit.\n• AES-256 encryption for sensitive data at rest.\n• Regular security audits and penetration testing.\n• Role-based access controls for our staff.\n\nNo method of transmission over the internet is 100% secure. We strive to protect your data but cannot guarantee absolute security.`,
  },
  {
    title: "6. Data Retention",
    body: `We retain your personal data for as long as your account is active or as needed to provide the Service. Upon account deletion:\n• Your personal data is deleted within 30 days.\n• Anonymised usage data may be retained for product improvement.\n• Payment records are retained as required by financial regulations.`,
  },
  {
    title: "7. Your Rights",
    body: `You have the right to:\n• **Access:** Request a copy of the personal data we hold about you.\n• **Correction:** Update inaccurate or incomplete data.\n• **Deletion:** Request deletion of your account and associated data.\n• **Portability:** Receive your data in a portable format.\n• **Objection:** Opt out of non-essential data processing.\n\nTo exercise these rights, email us at privacy@eduai.app.`,
  },
  {
    title: "8. Cookies and Tracking",
    body: `We use cookies and similar technologies to:\n• Keep you logged in across sessions.\n• Remember your language preference.\n• Analyse how the Service is used (aggregated, anonymised).\n\nYou can disable cookies in your browser settings, but this may affect functionality. We do not use third-party advertising cookies.`,
  },
  {
    title: "9. Third-Party Links",
    body: `The Service may contain links to third-party websites or YouTube videos. We are not responsible for the privacy practices of those third parties. We encourage you to read their privacy policies before submitting any personal information.`,
  },
  {
    title: "10. Changes to This Policy",
    body: `We may update this Privacy Policy periodically. We will notify you of significant changes via email or in-app notification. Continued use of the Service after changes indicates acceptance of the updated policy.`,
  },
  {
    title: "11. Contact Us",
    body: `For privacy-related questions, data requests, or concerns:\n\nEduAI Privacy Team\nEmail: privacy@eduai.app\nAddress: New Delhi, India\n\nWe aim to respond to all requests within 30 days.`,
  },
];

export default function PrivacyPage() {
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
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-bold text-lg">EduAI</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t("privacyPolicy")}</h1>
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
                EduAI is committed to protecting your privacy. This Privacy Policy explains how we collect, use,
                disclose, and safeguard your information when you use our platform. We are particularly mindful of
                our responsibilities toward student users and children.
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
              <Link to="/terms" className="text-primary-600 dark:text-primary-400 hover:underline">Terms of Service</Link>
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
