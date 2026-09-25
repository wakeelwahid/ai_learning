import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

const TOUR_STEPS = [
  {
    title: "Welcome to EduApp!",
    description: "Let's take a quick tour so you can get the most out of your learning experience.",
    emoji: "👋",
  },
  {
    title: "Track your progress",
    description: "Your stats, streak, and XP are shown right here on your dashboard so you always know where you stand.",
    emoji: "📊",
  },
  {
    title: "Watch & learn",
    description: "Head to the Learn section to browse video lessons organised by board, subject, and chapter.",
    emoji: "🎬",
  },
  {
    title: "Ask the AI Tutor",
    description: "Got a question? Tap \"Ask AI Tutor\" any time to get instant explanations tailored to you.",
    emoji: "🤖",
  },
  {
    title: "You're all set!",
    description: "Start your first lesson and build your streak. Good luck!",
    emoji: "🚀",
  },
];

const STORAGE_KEY = "onboarding_tour_done";

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  };

  const prev = () => setStep((s) => Math.max(0, s - 1));

  if (!visible) return null;

  const current = TOUR_STEPS[step];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding tour"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in p-3 sm:p-4"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-4 sm:p-6 relative">
        {/* Close */}
        <button
          onClick={dismiss}
          aria-label="Skip tour"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Badge */}
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Quick Tour · {step + 1} / {TOUR_STEPS.length}
        </div>

        {/* Emoji + content */}
        <div className="text-4xl mb-3">{current.emoji}</div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{current.title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6">{current.description}</p>

        {/* Step dots */}
        <div className="flex items-center gap-1.5 mb-5">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === step
                  ? "w-5 h-2 bg-primary-500"
                  : "w-2 h-2 bg-gray-200 dark:bg-gray-700"
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={prev}
            disabled={step === 0}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-0 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={next}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
          >
            {step < TOUR_STEPS.length - 1 ? (
              <>Next <ChevronRight className="w-4 h-4" /></>
            ) : (
              "Get started"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
