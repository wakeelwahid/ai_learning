import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { opportunityApi } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Briefcase, GraduationCap, BookOpen, Users, Award,
  ChevronRight, Clock, AlertCircle, Rocket,
} from "lucide-react";
import { Badge } from "@/components/ui";

const CATEGORIES = [
  {
    key:         "government_jobs",
    labelKey:    "govtJobs",
    emoji:       "🏛️",
    desc:        "SSC, Railway, Banking, Defence, UPSC & State Govt",
    bg:          "bg-gray-50 dark:bg-gray-800",
    border:      "border-gray-200 dark:border-gray-700",
    icon:        Briefcase,
  },
  {
    key:         "scholarships",
    labelKey:    "scholarshipsLabel",
    emoji:       "🎓",
    desc:        "National, State & Private scholarship programmes",
    bg:          "bg-gray-50 dark:bg-gray-800",
    border:      "border-gray-200 dark:border-gray-700",
    icon:        GraduationCap,
  },
  {
    key:         "entrance_exams",
    labelKey:    "entranceExamsLabel",
    emoji:       "📝",
    desc:        "JEE, NEET, CUET, NDA, CLAT, CA Foundation",
    bg:          "bg-gray-50 dark:bg-gray-800",
    border:      "border-gray-200 dark:border-gray-700",
    icon:        BookOpen,
  },
  {
    key:         "internships",
    labelKey:    "internshipsLabel",
    emoji:       "💼",
    desc:        "Student & summer internship programmes",
    bg:          "bg-gray-50 dark:bg-gray-800",
    border:      "border-gray-200 dark:border-gray-700",
    icon:        Users,
  },
  {
    key:         "olympiads",
    labelKey:    "olympiadsLabel",
    emoji:       "🏅",
    desc:        "Science, Mathematics & Cyber olympiads",
    bg:          "bg-gray-50 dark:bg-gray-800",
    border:      "border-gray-200 dark:border-gray-700",
    icon:        Award,
  },
];

function daysLeft(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  return diff;
}

function DeadlineBadge({ dateStr }: { dateStr: string }) {
  const days = daysLeft(dateStr);
  if (days < 0)
    return <span className="text-xs text-gray-400 dark:text-gray-500">Closed</span>;
  if (days <= 7)
    return (
      <Badge variant="danger" className="inline-flex items-center gap-1">
        <AlertCircle className="w-3 h-3" /> {days}d left
      </Badge>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
      <Clock className="w-3 h-3" /> {days}d left
    </span>
  );
}

export default function CareersHubPage() {
  const { t } = useLanguage();
  const { data: hub }      = useQuery({ queryKey: ["opp-hub"],      queryFn: () => opportunityApi.hubSummary().then(r => r.data) });
  const { data: upcoming } = useQuery({ queryKey: ["opp-upcoming"], queryFn: () => opportunityApi.upcoming(14).then(r => r.data) });

  return (
    <div className="space-y-8 w-full animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Rocket className="w-7 h-7 text-primary-600 dark:text-primary-400" />
            {t("careersHub")}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Government jobs, scholarships, exams, internships &amp; olympiads for Class 10–12 students
          </p>
        </div>
        <Link
          to="/career-guidance"
          className="text-sm text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-700 px-4 py-2 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors font-medium"
        >
          Career Guidance →
        </Link>
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {CATEGORIES.map((cat) => {
          const count = hub?.summary?.[cat.key]?.count ?? 0;
          const Icon = cat.icon;
          return (
            <Link
              key={cat.key}
              to={`/careers/${cat.key}`}
              className="group relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-900/30 border border-primary-100 dark:border-primary-800 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                {count > 0 && (
                  <span className="text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full">
                    {count} open
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-base mb-1 flex items-center gap-1.5">
                <span aria-hidden="true">{cat.emoji}</span> {t(cat.labelKey as any)}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{cat.desc}</p>
              <div className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 font-medium mt-3 group-hover:gap-2 transition-all">
                Explore <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Upcoming Deadlines */}
      {upcoming?.opportunities?.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-lg">
              <AlertCircle className="w-5 h-5 text-red-500" />
              {t("closingSoon")}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {upcoming.opportunities.slice(0, 6).map((opp: any) => (
              <Link
                key={opp.id}
                to={`/careers/detail/${opp.id}`}
                className="card hover:shadow-md hover:-translate-y-0.5 transition-all border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-700 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide mb-1">
                      {opp.category.replace(/_/g, " ")}
                    </p>
                    <p className="font-semibold text-gray-900 dark:text-white line-clamp-2 group-hover:text-primary-700 dark:group-hover:text-primary-300">
                      {opp.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{opp.organization}</p>
                    {opp.qualification && (
                      <p className="text-xs text-gray-400 mt-1">Qualification: {opp.qualification}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <DeadlineBadge dateStr={opp.last_date} />
                    {opp.total_posts && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full font-medium">
                        {opp.total_posts.toLocaleString()} posts
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured per category */}
      {CATEGORIES.map((cat) => {
        const featured: any[] = hub?.summary?.[cat.key]?.featured ?? [];
        if (!featured.length) return null;
        return (
          <section key={cat.key}>
            <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1 mb-3">
              <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-base min-w-0">
                <span className="flex-shrink-0">{cat.emoji}</span> <span className="truncate">{t(cat.labelKey as any)}</span>
              </h2>
              <Link
                to={`/careers/${cat.key}`}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1 flex-shrink-0"
              >
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {featured.map((opp: any) => (
                <Link
                  key={opp.id}
                  to={`/careers/detail/${opp.id}`}
                  className="card hover:shadow-md hover:-translate-y-0.5 border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-700 transition-all group"
                >
                  <p className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-2 group-hover:text-primary-700 dark:group-hover:text-primary-300 mb-1">
                    {opp.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{opp.organization}</p>
                  <div className="flex items-center justify-between">
                    <DeadlineBadge dateStr={opp.last_date} />
                    {opp.is_featured && (
                      <Badge variant="warning" className="text-[10px]">Featured</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {/* Empty state */}
      {!hub?.summary && (
        <div className="text-center py-16">
          <Rocket className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Opportunities loading…</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500">New opportunities are added regularly. Check back soon!</p>
        </div>
      )}
    </div>
  );
}
