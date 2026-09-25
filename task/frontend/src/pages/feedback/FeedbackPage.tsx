import { useNavigate } from "react-router-dom";
import { useAppSelector } from "@/store";
import FeedbackSection from "@/components/FeedbackSection";
import Card from "@/components/ui/Card";
import { ChevronLeft, MessageSquarePlus } from "lucide-react";

export default function FeedbackPage() {
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);

  return (
    <div className="w-full space-y-5 animate-fade-in">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
          <MessageSquarePlus className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Send Feedback</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Help us improve EduLearn</p>
        </div>
      </div>

      <div className="xl:flex xl:gap-8 xl:items-start">
        <div className="flex-1 min-w-0">
          {user?.id
            ? <FeedbackSection userId={user.id} />
            : <p className="text-sm text-gray-500">Please log in to send feedback.</p>}
        </div>
        <aside className="hidden xl:flex flex-col w-72 flex-shrink-0 sticky top-6 self-start space-y-4">
          <Card>
            <p className="font-semibold text-gray-900 dark:text-white text-sm mb-3">Tips for good feedback</p>
            <ul className="space-y-2.5 text-xs text-gray-500 dark:text-gray-400">
              {[
                "Be specific — mention the feature or page",
                "Include steps to reproduce any bugs",
                "Suggest an improvement, not just a problem",
                "One topic per feedback for faster resolution",
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0 mt-1.5" />
                  {tip}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="text-center">
            <p className="text-2xl mb-1">💬</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">We read every submission</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Your feedback shapes the product. Average response time: 48h</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
