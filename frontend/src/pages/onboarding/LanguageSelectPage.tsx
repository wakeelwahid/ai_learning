import { useState } from "react";
import { LANGUAGES, Lang } from "@/i18n/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { Check, Globe } from "lucide-react";
import { Button } from "@/components/ui";

// Solid accent tints per language card — no gradients, one flat color each.
const ACCENTS = ["bg-primary-500", "bg-orange-500", "bg-emerald-500", "bg-amber-500"];

const BG_LIGHTS = [
  "bg-primary-50 dark:bg-primary-950/30 border-primary-200 dark:border-primary-700",
  "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-700",
  "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700",
  "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-700",
];

interface Props {
  onDone: () => void;
}

export default function LanguageSelectPage({ onDone }: Props) {
  const { setLanguage, t } = useLanguage();
  const [selected, setSelected] = useState<Lang>("en");
  const [animating, setAnimating] = useState(false);

  const handleContinue = () => {
    setAnimating(true);
    setLanguage(selected);
    setTimeout(() => {
      onDone();
    }, 400);
  };

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 transition-opacity duration-400 ${animating ? "opacity-0" : "opacity-100"}`}
    >
      {/* Logo / Brand */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center shadow-sm">
          <Globe className="w-8 h-8 text-white" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            EduAI Platform
          </h2>
          <p className="text-sm font-normal text-gray-500 dark:text-gray-400 mt-1">
            AI-Powered Learning for Every Student
          </p>
        </div>
      </div>

      {/* Heading */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t("selectLanguage")}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-base max-w-xs mx-auto">
          {t("selectLangSub")}
        </p>
      </div>

      {/* Language Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-md mb-10">
        {LANGUAGES.map((lang, idx) => {
          const isSelected = selected === lang.code;
          return (
            <button
              key={lang.code}
              onClick={() => setSelected(lang.code as Lang)}
              className={`relative rounded-2xl border-2 p-3 sm:p-5 flex flex-col items-center gap-2 transition-all duration-150 text-left focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-0
                ${isSelected
                  ? `border-primary-500 bg-primary-50 dark:bg-primary-950/50 shadow-sm`
                  : `${BG_LIGHTS[idx]} hover:shadow-sm`
                }
              `}
            >
              {isSelected && (
                <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </span>
              )}
              {/* Script preview */}
              <div
                className={`w-12 h-12 rounded-xl ${ACCENTS[idx]} flex items-center justify-center shadow-sm`}
                dir={lang.dir}
              >
                <span className="text-white text-base font-bold tracking-wider leading-none">
                  {lang.script}
                </span>
              </div>
              {/* Labels */}
              <div className="text-center">
                <p
                  className="font-bold text-gray-900 dark:text-white text-base leading-tight"
                  dir={lang.dir}
                >
                  {lang.nativeLabel}
                </p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                  {lang.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Continue Button */}
      <Button onClick={handleContinue} size="lg" fullWidth className="max-w-md">
        {t("continueBtn")}
      </Button>

      {/* Decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-primary-400/10 dark:bg-primary-600/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-primary-400/10 dark:bg-primary-600/10 blur-3xl" />
      </div>
    </div>
  );
}
