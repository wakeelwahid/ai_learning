import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { careerApi } from "@/lib/api";
import { useAppSelector } from "@/store";
import { Search, ChevronRight, Target, Star, BarChart3, Rocket } from "lucide-react";
import CareerDetailPage from "./CareerDetailPage";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, Badge, Input } from "@/components/ui";

const CATEGORY_ICONS: Record<string, string> = {
  Engineering: "⚙️", Medical: "🏥", Government: "🏛️", Commerce: "💼",
  Law: "⚖️", Emerging: "🚀", Defense: "🛡️", Creative: "🎨", Science: "🔬",
};

export default function CareerExplorerPage() {
  const { t } = useLanguage();
  const user = useAppSelector((s) => s.auth.user);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCareer, setSelectedCareer] = useState<any>(null);

  const { data: categoriesData } = useQuery({
    queryKey: ["career-categories"],
    queryFn: () => careerApi.categories().then((r) => r.data),
  });

  const { data: careersData, isLoading } = useQuery({
    queryKey: ["careers", selectedCategory, search],
    queryFn: () => careerApi.list({ category: selectedCategory ?? undefined, search: search || undefined, limit: 50 }).then((r) => r.data),
  });

  const { data: dashboardData } = useQuery({
    queryKey: ["career-dashboard", user?.id],
    queryFn: () => careerApi.dashboard(user!.id).then((r) => r.data),
    enabled: !!user?.id,
  });

  if (selectedCareer) {
    return <CareerDetailPage career={selectedCareer} userId={user!.id} onBack={() => setSelectedCareer(null)} />;
  }

  const categories: string[] = categoriesData?.categories ?? [];
  const careers: any[] = careersData?.careers ?? [];
  const dashboard = dashboardData;

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="rounded-2xl bg-primary-600 p-4 sm:p-6 text-white">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold flex items-center gap-2"><Rocket className="w-7 h-7 flex-shrink-0" /> {t("careers")}</h1>
            <p className="text-primary-200 text-sm mt-1">Discover your path · Analyse skill gaps · Build your roadmap</p>
          </div>
          {dashboard?.primary_goal && (
            <div className="bg-white/15 rounded-xl px-4 py-3 text-sm max-w-xs">
              <p className="text-primary-200 text-xs font-semibold uppercase tracking-wide mb-1">Your Goal</p>
              <p className="font-bold text-white">{dashboard.primary_goal.career_name}</p>
              {dashboard.latest_assessment && (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                    <div className="h-full bg-white rounded-full" style={{ width: `${dashboard.latest_assessment.ready_score}%` }} />
                  </div>
                  <p className="text-xs text-primary-200 mt-1">{dashboard.latest_assessment.ready_score}% ready</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 mt-5">
          {[
            { icon: Target, label: "Goals Set", value: dashboard?.goal_count ?? 0 },
            { icon: BarChart3, label: "Assessments", value: dashboard?.assessment_count ?? 0 },
            { icon: Star, label: "Careers", value: careers.length },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
              <Icon className="w-4 h-4 mx-auto mb-1 text-white/70" />
              <p className="text-lg font-bold">{value}</p>
              <p className="text-xs text-primary-200">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          className="pl-10"
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${!selectedCategory ? "bg-primary-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${selectedCategory === cat ? "bg-primary-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
          >
            {CATEGORY_ICONS[cat] ?? "📌"} {cat}
          </button>
        ))}
      </div>

      {/* Career grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {careers.map((career: any) => (
            <button
              key={career.id}
              onClick={() => setSelectedCareer(career)}
              className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 border-l-4 border-l-primary-500 rounded-2xl p-4 text-left hover:shadow-md transition-shadow relative overflow-hidden"
            >
              <div className="text-2xl mb-2">{CATEGORY_ICONS[career.category] ?? "💼"}</div>
              <p className="font-semibold text-sm leading-tight text-gray-900 dark:text-white">{career.name}</p>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-1 line-clamp-2">{career.overview?.slice(0, 60)}...</p>
              {career.avg_salary_lpa && (
                <p className="text-primary-600 dark:text-primary-400 text-xs mt-2 font-semibold">₹{career.avg_salary_lpa}L avg salary</p>
              )}
              <ChevronRight className="absolute bottom-3 right-3 w-4 h-4 text-gray-300 dark:text-gray-600" />
            </button>
          ))}
        </div>
      )}

      {/* Goals section */}
      {dashboard?.goals?.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-primary-600" /> My Career Goals
          </h3>
          {dashboard.goals.map((goal: any) => (
            <Card key={goal.career_id} hover className="flex items-center gap-3" onClick={() => {
              const c = careers.find((c) => c.id === goal.career_id);
              if (c) setSelectedCareer(c);
            }}>
              <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-xl flex-shrink-0">
                {CATEGORY_ICONS[goal.category] ?? "🎯"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{goal.career_name}</p>
                {goal.ready_score != null && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${goal.ready_score}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{goal.ready_score}% ready</span>
                  </div>
                )}
              </div>
              {goal.is_primary && (
                <Badge variant="primary" className="flex-shrink-0">Primary</Badge>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
