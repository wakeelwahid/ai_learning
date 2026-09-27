import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { useAppSelector } from "@/store";
import LanguageSelectPage from "@/pages/onboarding/LanguageSelectPage";
import Layout from "@/components/layout/Layout";
import PublicLayout from "@/components/layout/PublicLayout";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import RoleGuard from "@/components/auth/RoleGuard";
import ProfileGuard from "@/components/auth/ProfileGuard";
import ForbiddenPage from "@/pages/ForbiddenPage";

// ── Marketing / public pages (SEO-indexed, no auth) ──────────────────────────
const LandingPage                 = lazy(() => import("@/pages/home/LandingPage"));
const CoursesPage                 = lazy(() => import("@/pages/public/CoursesPage"));
const PricingPage                 = lazy(() => import("@/pages/public/PricingPage"));
const FeaturesPage                = lazy(() => import("@/pages/public/FeaturesPage"));
const AboutPage                   = lazy(() => import("@/pages/public/AboutPage"));
const ContactPage                 = lazy(() => import("@/pages/public/ContactPage"));
const FAQPage                     = lazy(() => import("@/pages/public/FAQPage"));
const DocsPage                    = lazy(() => import("@/pages/public/DocsPage"));
const BlogPage                    = lazy(() => import("@/pages/blog/BlogPage"));
const BlogPostPage                = lazy(() => import("@/pages/blog/BlogPostPage"));

// ── Auth pages (no layout) ────────────────────────────────────────────────────
const LoginPage                   = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterPage                = lazy(() => import("@/pages/auth/RegisterPage"));
const RoleSelectPage              = lazy(() => import("@/pages/auth/RoleSelectPage"));
const ProfileCompletionPage       = lazy(() => import("@/pages/auth/ProfileCompletionPage"));
const ForgotPasswordPage          = lazy(() => import("@/pages/auth/ForgotPasswordPage"));
const ResetPasswordPage           = lazy(() => import("@/pages/auth/ResetPasswordPage"));
const AuthCallbackPage            = lazy(() => import("@/pages/auth/AuthCallbackPage"));
const TermsPage                   = lazy(() => import("@/pages/legal/TermsPage"));
const PrivacyPage                 = lazy(() => import("@/pages/legal/PrivacyPage"));
const NotFoundPage                = lazy(() => import("@/pages/NotFoundPage"));

// ── Student pages (auth required) ────────────────────────────────────────────
const DashboardPage               = lazy(() => import("@/pages/dashboard/DashboardPage"));
const ContentPage                 = lazy(() => import("@/pages/content/ContentPage"));
const VideoPlayerPage             = lazy(() => import("@/pages/content/VideoPlayerPage"));
const PracticeQuizPage            = lazy(() => import("@/pages/content/PracticeQuizPage"));
const KnowledgeHubPage            = lazy(() => import("@/pages/content/KnowledgeHubPage"));
const KnowledgeArticlePage        = lazy(() => import("@/pages/content/KnowledgeArticlePage"));
const PreviousYearPapersPage      = lazy(() => import("@/pages/content/PreviousYearPapersPage"));
const RevisionCenterPage          = lazy(() => import("@/pages/content/RevisionCenterPage"));
const SavedPage                   = lazy(() => import("@/pages/content/SavedPage"));
const SearchResultsPage           = lazy(() => import("@/pages/search/SearchResultsPage"));
const QuizPage                    = lazy(() => import("@/pages/quiz/QuizPage"));
const AIAssistantPage             = lazy(() => import("@/pages/ai/AIAssistantPage"));
const LeaderboardPage             = lazy(() => import("@/pages/gamification/LeaderboardPage"));
const EduPointsPage               = lazy(() => import("@/pages/gamification/EduPointsPage"));
const LevelProgressPage           = lazy(() => import("@/pages/gamification/LevelProgressPage"));
const SubscriptionPage            = lazy(() => import("@/pages/payment/SubscriptionPage"));
const PaymentReturnPage           = lazy(() => import("@/pages/payment/PaymentReturnPage"));
const ProfilePage                 = lazy(() => import("@/pages/profile/ProfilePage"));
const SettingsPage                = lazy(() => import("@/pages/settings/SettingsPage"));
const NotificationPrefsPage       = lazy(() => import("@/pages/settings/NotificationPrefsPage"));
const InfoPage                    = lazy(() => import("@/pages/info/InfoPage"));
const FeedbackPage                = lazy(() => import("@/pages/feedback/FeedbackPage"));
const RoadmapPage                 = lazy(() => import("@/pages/roadmap/RoadmapPage"));
const MessagesPage                = lazy(() => import("@/pages/messages/MessagesPage"));
const StudentSearchPage           = lazy(() => import("@/pages/messages/StudentSearchPage"));
const WeeklyReportPage            = lazy(() => import("@/pages/analytics/WeeklyReportPage"));
const AnalyticsDashboardPage      = lazy(() => import("@/pages/analytics/AnalyticsDashboardPage"));
const BattlePage                  = lazy(() => import("@/pages/battle/BattlePage"));
const CareersHubPage              = lazy(() => import("@/pages/career/CareersHubPage"));
const OpportunityListPage         = lazy(() => import("@/pages/career/OpportunityListPage"));
const OpportunityDetailPage       = lazy(() => import("@/pages/career/OpportunityDetailPage"));
const CareerExplorerPage          = lazy(() => import("@/pages/career/CareerExplorerPage"));
const NotificationsPage           = lazy(() => import("@/pages/notifications/NotificationsPage"));
const ReferralPage                = lazy(() => import("@/pages/referral/ReferralPage"));
const ChallengesListPage          = lazy(() => import("@/pages/challenges/ChallengesListPage"));
const ChallengeDetailPage         = lazy(() => import("@/pages/challenges/ChallengeDetailPage"));

// ── Parent pages (auth required) ─────────────────────────────────────────────
const ParentDashboardPage         = lazy(() => import("@/pages/parent/ParentDashboardPage"));
const ParentAIChatPage            = lazy(() => import("@/pages/parent/ParentAIChatPage"));
const ParentCommunicationPage     = lazy(() => import("@/pages/parent/ParentCommunicationPage"));
const ParentLinkStudentPage       = lazy(() => import("@/pages/parent/ParentLinkStudentPage"));
const ParentMeetingsPage          = lazy(() => import("@/pages/parent/ParentMeetingsPage"));
const ParentSettingsPage          = lazy(() => import("@/pages/parent/ParentSettingsPage"));
const ParentStudyLimitsPage       = lazy(() => import("@/pages/parent/ParentStudyLimitsPage"));
const ParentNotificationPrefsPage = lazy(() => import("@/pages/parent/ParentNotificationPrefsPage"));
const ParentMessagesPage          = lazy(() => import("@/pages/parent/ParentMessagesPage"));
const ParentMonitorPage           = lazy(() => import("@/pages/parent/ParentMonitorPage"));

// ── Teacher pages (auth required) ────────────────────────────────────────────
const TeacherDashboardPage        = lazy(() => import("@/pages/teacher/TeacherDashboardPage"));

function PageLoader() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  );
}

/** Redirect unauthenticated users to /login */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAppSelector(s => s.auth.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

/**
 * Root "/" route:
 * - Logged-in students  → /dashboard (or last video)
 * - Logged-in parents   → /parent/dashboard
 * - Guests              → Landing page (SEO-indexed)
 */
function SmartIndex() {
  const token = useAppSelector(s => s.auth.token);
  const role  = useAppSelector(s => s.auth.user?.role?.toLowerCase());

  if (token) {
    if (role === "parent") return <Navigate to="/parent/dashboard" replace />;
    if (role === "teacher") return <Navigate to="/teacher/dashboard" replace />;
    const lastRoute = localStorage.getItem("edulearn_last_route");
    if (lastRoute?.startsWith("/learn/video/")) return <Navigate to={lastRoute} replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return <LandingPage />;
}

export default function App() {
  const [langPicked, setLangPicked] = useState<boolean>(
    () => Boolean(localStorage.getItem("app_language"))
  );

  if (!langPicked) {
    return <LanguageSelectPage onDone={() => setLangPicked(true)} />;
  }

  return (
    <HelmetProvider>
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>

          {/* ── Public marketing pages (PublicLayout: header + footer) ── */}
          <Route element={<PublicLayout />}>
            <Route path="/"          element={<SmartIndex />} />
            <Route path="/courses"   element={<CoursesPage />} />
            <Route path="/pricing"   element={<PricingPage />} />
            <Route path="/features"  element={<FeaturesPage />} />
            <Route path="/about"     element={<AboutPage />} />
            <Route path="/contact"   element={<ContactPage />} />
            <Route path="/faq"       element={<FAQPage />} />
            <Route path="/docs"      element={<DocsPage />} />
            <Route path="/blog"      element={<BlogPage />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
          </Route>

          {/* ── Auth pages (no layout) ───────────────────────────────── */}
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />
          <Route path="/auth/callback"   element={<AuthCallbackPage />} />
          <Route path="/auth/error"      element={<LoginPage />} />
          <Route path="/terms"           element={<TermsPage />} />
          <Route path="/privacy"         element={<PrivacyPage />} />

          {/* One-time role choice for a brand-new phone-OTP account
              (role=pending) — ProfileGuard redirects here first, before
              profile-complete, when the logged-in user has no real role
              yet. Outside ProfileGuard (it's a redirect target) but still
              inside PrivateRoute so an anonymous user can't reach it. */}
          <Route element={<PrivateRoute><RoleSelectPage /></PrivateRoute>} path="/role-select" />

          {/* Mandatory profile completion — outside ProfileGuard (that's the
              redirect target) but still inside PrivateRoute (still requires
              a valid token) so an anonymous user can't reach it either. */}
          <Route element={<PrivateRoute><ProfileCompletionPage /></PrivateRoute>} path="/profile-complete" />

          {/* ── Protected app routes (auth required, app Layout) ────── */}
          <Route element={<PrivateRoute><ProfileGuard><SubscriptionProvider><Layout /></SubscriptionProvider></ProfileGuard></PrivateRoute>}>
            {/* Student routes */}
            <Route path="/dashboard"                element={<RoleGuard allow="student"><DashboardPage /></RoleGuard>} />
            <Route path="/learn"                    element={<RoleGuard allow="student"><ContentPage /></RoleGuard>} />
            <Route path="/learn/video/:videoId"     element={<RoleGuard allow="student"><VideoPlayerPage /></RoleGuard>} />
            <Route path="/learn/practice/:level/:id" element={<RoleGuard allow="student"><PracticeQuizPage /></RoleGuard>} />
            <Route path="/knowledge-hub"            element={<RoleGuard allow="student"><KnowledgeHubPage /></RoleGuard>} />
            <Route path="/knowledge/:articleId"     element={<RoleGuard allow="student"><KnowledgeArticlePage /></RoleGuard>} />
            <Route path="/pyps"                     element={<RoleGuard allow="student"><PreviousYearPapersPage /></RoleGuard>} />
            <Route path="/revision"                 element={<RoleGuard allow="student"><RevisionCenterPage /></RoleGuard>} />
            <Route path="/saved"                    element={<RoleGuard allow="student"><SavedPage /></RoleGuard>} />
            <Route path="/search"                   element={<RoleGuard allow="student"><SearchResultsPage /></RoleGuard>} />
            <Route path="/quiz/:quizId"             element={<RoleGuard allow="student"><QuizPage /></RoleGuard>} />
            <Route path="/ai-assistant"             element={<RoleGuard allow="student"><AIAssistantPage /></RoleGuard>} />
            <Route path="/leaderboard"              element={<RoleGuard allow="student"><LeaderboardPage /></RoleGuard>} />
            <Route path="/edupoints"                element={<RoleGuard allow="student"><EduPointsPage /></RoleGuard>} />
            <Route path="/level"                    element={<RoleGuard allow="student"><LevelProgressPage /></RoleGuard>} />
            <Route path="/subscription"             element={<RoleGuard allow="student"><SubscriptionPage /></RoleGuard>} />
            <Route path="/payment-return"            element={<RoleGuard allow="any"><PaymentReturnPage /></RoleGuard>} />
            <Route path="/profile"                  element={<RoleGuard allow="any"><ProfilePage /></RoleGuard>} />
            <Route path="/settings"                 element={<RoleGuard allow="any"><SettingsPage /></RoleGuard>} />
            <Route path="/notification-prefs"       element={<RoleGuard allow="student"><NotificationPrefsPage /></RoleGuard>} />
            <Route path="/info/:slug"               element={<InfoPage />} />
            <Route path="/feedback"                 element={<RoleGuard allow="any"><FeedbackPage /></RoleGuard>} />
            <Route path="/roadmap"                  element={<RoleGuard allow="any"><RoadmapPage /></RoleGuard>} />
            <Route path="/messages"                 element={<RoleGuard allow="student"><MessagesPage /></RoleGuard>} />
            <Route path="/messages/search"          element={<RoleGuard allow="student"><StudentSearchPage /></RoleGuard>} />
            <Route path="/analytics"                element={<RoleGuard allow="student"><AnalyticsDashboardPage /></RoleGuard>} />
            <Route path="/analytics/weekly"         element={<RoleGuard allow="student"><WeeklyReportPage /></RoleGuard>} />
            <Route path="/battle"                   element={<RoleGuard allow="student"><BattlePage /></RoleGuard>} />
            {/* Share-link deep link: /battle/<INVITE_CODE> auto-joins straight into the lobby */}
            <Route path="/battle/:inviteCode"       element={<RoleGuard allow="student"><BattlePage /></RoleGuard>} />
            <Route path="/careers"                  element={<RoleGuard allow="student"><CareersHubPage /></RoleGuard>} />
            <Route path="/careers/:category"        element={<RoleGuard allow="student"><OpportunityListPage /></RoleGuard>} />
            <Route path="/careers/detail/:id"       element={<RoleGuard allow="student"><OpportunityDetailPage /></RoleGuard>} />
            <Route path="/career-guidance"          element={<RoleGuard allow="student"><CareerExplorerPage /></RoleGuard>} />
            <Route path="/notifications"            element={<RoleGuard allow="any"><NotificationsPage /></RoleGuard>} />
            <Route path="/referral"                 element={<RoleGuard allow="any"><ReferralPage /></RoleGuard>} />
            <Route path="/challenges"               element={<RoleGuard allow="student"><ChallengesListPage /></RoleGuard>} />
            <Route path="/challenges/:programId"    element={<RoleGuard allow="student"><ChallengeDetailPage /></RoleGuard>} />

            {/* Parent routes */}
            <Route path="/parent/dashboard"          element={<RoleGuard allow="parent"><ParentDashboardPage /></RoleGuard>} />
            <Route path="/parent/ai-chat"            element={<RoleGuard allow="parent"><ParentAIChatPage /></RoleGuard>} />
            <Route path="/parent/communication"      element={<RoleGuard allow="parent"><ParentCommunicationPage /></RoleGuard>} />
            <Route path="/parent/link-student"       element={<RoleGuard allow="parent"><ParentLinkStudentPage /></RoleGuard>} />
            <Route path="/parent/meetings"           element={<RoleGuard allow="parent"><ParentMeetingsPage /></RoleGuard>} />
            <Route path="/parent/settings"           element={<RoleGuard allow="parent"><ParentSettingsPage /></RoleGuard>} />
            <Route path="/parent/study-limits"       element={<RoleGuard allow="parent"><ParentStudyLimitsPage /></RoleGuard>} />
            <Route path="/parent/notification-prefs" element={<RoleGuard allow="parent"><ParentNotificationPrefsPage /></RoleGuard>} />
            <Route path="/parent/messages"           element={<RoleGuard allow="parent"><ParentMessagesPage /></RoleGuard>} />
            <Route path="/parent/monitor/:child_id"  element={<RoleGuard allow="parent"><ParentMonitorPage /></RoleGuard>} />

            {/* Teacher routes */}
            <Route path="/teacher/dashboard"         element={<RoleGuard allow="teacher"><TeacherDashboardPage /></RoleGuard>} />
          </Route>

          {/* ── Error pages ──────────────────────────────────────────── */}
          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="*"    element={<NotFoundPage />} />

        </Routes>
      </Suspense>
    </BrowserRouter>
    </HelmetProvider>
  );
}
