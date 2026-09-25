import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAppSelector } from "@/store";
import AdminLayout from "@/components/layout/AdminLayout";
import LoginPage from "@/pages/auth/LoginPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import UsersPage from "@/pages/users/UsersPage";
import UserAnalyticsPage from "@/pages/users/UserAnalyticsPage";
import PlatformHealthPage from "@/pages/system/PlatformHealthPage";
import LoginBackgroundsPage from "@/pages/system/LoginBackgroundsPage";
import ContentPage from "@/pages/content/ContentPage";
import AssignmentsPage from "@/pages/assignments/AssignmentsPage";
import QuizManagementPage from "@/pages/quiz/QuizManagementPage";
import AnalyticsPage from "@/pages/analytics/AnalyticsPage";
import PaymentsPage from "@/pages/payments/PaymentsPage";
import NotificationsPage from "@/pages/notifications/NotificationsPage";
import GamificationPage from "@/pages/gamification/GamificationPage";
import ChallengeProgramsPage from "@/pages/challenges/ChallengeProgramsPage";
import ReferralPage from "@/pages/referral/ReferralPage";
import RAGUploadPage from "@/pages/ai/RAGUploadPage";
import AIContentPage from "@/pages/ai/AIContentPage";
import AIGeneratePage from "@/pages/ai/AIGeneratePage";
import GeneratedPapersPage from "@/pages/ai/GeneratedPapersPage";
import CouponsPage from "@/pages/coupons/CouponsPage";
import PlansPage from "@/pages/plans/PlansPage";
import BattlesPage from "@/pages/battles/BattlesPage";
import CareersPage from "@/pages/careers/CareersPage";
import InfoPagesPage from "@/pages/info-pages/InfoPagesPage";
import BlogPostsPage from "@/pages/blog/BlogPostsPage";
import ContentManagerPage from "@/pages/content/ContentManagerPage";
import EngagementPage from "@/pages/engagement/EngagementPage";
import MeetingsPage from "@/pages/meetings/MeetingsPage";
import ModerationPage from "@/pages/moderation/ModerationPage";
import ContactMessagesPage from "@/pages/contact-messages/ContactMessagesPage";
import AuditLogPage from "@/pages/audit-log/AuditLogPage";

function Guard({ children }: { children: React.ReactNode }) {
  const token = useAppSelector((s) => s.auth.token);
  const user = useAppSelector((s) => s.auth.user);
  if (!token) return <Navigate to="/login" replace />;
  if (user && !["admin", "super_admin"].includes(user.role))
    return <div className="p-8 text-red-600 font-semibold">Access denied — admin only.</div>;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <Guard>
              <AdminLayout />
            </Guard>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:id/analytics" element={<UserAnalyticsPage />} />
          <Route path="meetings" element={<MeetingsPage />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="quizzes" element={<QuizManagementPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="engagement" element={<EngagementPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="gamification" element={<GamificationPage />} />
          <Route path="challenges" element={<ChallengeProgramsPage />} />
          <Route path="referrals" element={<ReferralPage />} />
          <Route path="rag-upload" element={<RAGUploadPage />} />
          <Route path="ai-content" element={<AIContentPage />} />
          <Route path="ai-generate" element={<AIGeneratePage />} />
          <Route path="generated-papers" element={<GeneratedPapersPage />} />
          <Route path="coupons" element={<CouponsPage />} />
          <Route path="battles" element={<BattlesPage />} />
          <Route path="careers" element={<CareersPage />} />
          <Route path="info-pages" element={<InfoPagesPage />} />
          <Route path="blog-posts" element={<BlogPostsPage />} />
          <Route path="content-manager" element={<ContentManagerPage />} />
          <Route path="moderation" element={<ModerationPage />} />
          <Route path="contact-messages" element={<ContactMessagesPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="platform-health" element={<PlatformHealthPage />} />
          <Route path="login-backgrounds" element={<LoginBackgroundsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
