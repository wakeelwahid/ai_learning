import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { MessageSquarePlus, CheckCircle, Star } from "lucide-react";

const FEEDBACK_CATEGORIES = ["Bug Report", "Feature Request", "Content Issue", "Other"] as const;
type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];

export default function FeedbackSection({ userId }: { userId: string }) {
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () =>
      api.post("/v1/notifications/feedback", {
        rating: selectedRating,
        category,
        message,
        user_id: userId,
      }),
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setSelectedRating(0);
        setCategory(null);
        setMessage("");
      }, 3000);
    },
    onError: () => toast.error("Failed to send feedback. Please try again."),
  });

  const handleSubmit = () => {
    if (!selectedRating) { toast.error("Please select a star rating"); return; }
    if (!category) { toast.error("Please select a category"); return; }
    if (!message.trim()) { toast.error("Please enter a message"); return; }
    submitMutation.mutate();
  };

  return (
    <div className="card p-4">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <MessageSquarePlus className="w-4 h-4 text-emerald-500" /> Send Feedback
      </h3>

      {submitted ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Thank you for your feedback!</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">We appreciate your input on EduLearn.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Star rating */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Rating</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setSelectedRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-6 h-6 transition-colors ${
                      star <= (hoveredRating || selectedRating)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-300 dark:text-gray-600"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Category pills */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Category</p>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors font-medium ${
                    category === cat
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:border-emerald-600 dark:hover:text-emerald-400"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Message textarea */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Message</p>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what you think about EduLearn..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent resize-none transition"
            />
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitMutation.isPending ? "Sending…" : "Submit Feedback"}
          </button>
        </div>
      )}
    </div>
  );
}
