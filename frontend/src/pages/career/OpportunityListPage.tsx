import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { opportunityApi } from "@/lib/api";
import { ChevronRight, Clock, AlertCircle, ArrowLeft, Filter } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui";

const CATEGORY_META: Record<string, { label: string; emoji: string; subcategories: { key: string; label: string }[] }> = {
  government_jobs: {
    label: "Government Jobs",
    emoji: "🏛️",
    subcategories: [
      { key: "ssc",      label: "SSC" },
      { key: "railway",  label: "Railway" },
      { key: "banking",  label: "Banking" },
      { key: "defence",  label: "Defence" },
      { key: "upsc",     label: "UPSC" },
      { key: "state",    label: "State Govt" },
    ],
  },
  scholarships: {
    label: "Scholarships",
    emoji: "🎓",
    subcategories: [
      { key: "national", label: "National" },
      { key: "state",    label: "State" },
      { key: "private",  label: "Private" },
    ],
  },
  entrance_exams: {
    label: "Entrance Exams",
    emoji: "📝",
    subcategories: [
      { key: "jee",           label: "JEE" },
      { key: "neet",          label: "NEET" },
      { key: "cuet",          label: "CUET" },
      { key: "nda",           label: "NDA" },
      { key: "clat",          label: "CLAT" },
      { key: "ca_foundation", label: "CA Foundation" },
    ],
  },
  internships: {
    label: "Internships",
    emoji: "💼",
    subcategories: [
      { key: "student", label: "Student" },
      { key: "summer",  label: "Summer" },
    ],
  },
  olympiads: {
    label: "Olympiads",
    emoji: "🏅",
    subcategories: [
      { key: "science", label: "Science" },
      { key: "maths",   label: "Maths" },
      { key: "cyber",   label: "Cyber" },
    ],
  },
};

function daysLeft(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function DeadlineBadge({ dateStr, closingSoonLabel, lastDateLabel }: { dateStr: string; closingSoonLabel: string; lastDateLabel: string }) {
  const days = daysLeft(dateStr);
  if (days < 0) return <span className="text-xs text-gray-400 dark:text-gray-500">Closed</span>;
  if (days <= 7)
    return (
      <Badge variant="danger" className="inline-flex items-center gap-1">
        <AlertCircle className="w-3 h-3" /> {closingSoonLabel} · {days}d
      </Badge>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
      <Clock className="w-3 h-3" /> {lastDateLabel} {days}d left
    </span>
  );
}

export default function OpportunityListPage() {
  const { t } = useLanguage();
  const { category } = useParams<{ category: string }>();
  const [subcat, setSubcat] = useState<string>("");

  const CATEGORY_LABELS: Record<string, string> = {
    government_jobs: t("govtJobs"),
    scholarships: t("scholarshipsLabel"),
    entrance_exams: t("entranceExamsLabel"),
    internships: t("internshipsLabel"),
    olympiads: t("olympiadsLabel"),
  };

  const metaBase = CATEGORY_META[category ?? ""] ?? { label: "Opportunities", emoji: "📋", subcategories: [] };
  const meta = {
    ...metaBase,
    label: CATEGORY_LABELS[category ?? ""] ?? metaBase.label,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["opp-list", category, subcat],
    queryFn: () =>
      opportunityApi.list({ category: category ?? "", subcategory: subcat || undefined }).then(r => r.data),
    enabled: !!category,
  });

  return (
    <div className="w-full space-y-6 animate-fade-in">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
        <Link to="/careers" className="flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 flex-shrink-0">
          <ArrowLeft className="w-4 h-4" /> Career Hub
        </Link>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-gray-900 dark:text-white font-medium break-words min-w-0">{meta.emoji} {meta.label}</span>
      </div>

      {/* Subcategory filter */}
      {meta.subcategories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" aria-label={t("filter")} />
          <button
            onClick={() => setSubcat("")}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              !subcat
                ? "bg-primary-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            All
          </button>
          {meta.subcategories.map(s => (
            <button
              key={s.key}
              onClick={() => setSubcat(s.key)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                subcat === s.key
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Count */}
      {!isLoading && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {data?.total ?? 0} opportunities found
        </p>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3" />
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              <p className="sr-only">{t("loading")}</p>
            </div>
          ))}
        </div>
      ) : data?.opportunities?.length ? (
        <div className="space-y-4">
          {data.opportunities.map((opp: any) => (
            <Link
              key={opp.id}
              to={`/careers/detail/${opp.id}`}
              className="card block hover:shadow-md hover:-translate-y-0.5 border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-700 transition-all group"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide">
                      {opp.subcategory.replace(/_/g, " ")}
                    </span>
                    {opp.is_featured && (
                      <Badge variant="warning" className="text-[10px]">Featured</Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-primary-700 dark:group-hover:text-primary-300">
                    {opp.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{opp.organization}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {opp.qualification && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        🎓 {opp.qualification}
                      </span>
                    )}
                    {opp.total_posts && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        📋 {t("totalPosts")} {opp.total_posts.toLocaleString()}
                      </span>
                    )}
                    {opp.application_fee !== null && opp.application_fee !== undefined && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        💰 Fee: {opp.application_fee === 0 ? "Free" : `₹${opp.application_fee}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col xs:flex-row sm:flex-col items-start xs:items-center sm:items-end gap-2 flex-wrap flex-shrink-0">
                  <DeadlineBadge dateStr={opp.last_date} closingSoonLabel={t("closingSoon")} lastDateLabel={t("lastDate")} />
                  {opp.exam_date && (
                    <span className="text-xs text-gray-400">
                      Exam: {new Date(opp.exam_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  <span className="text-xs text-primary-600 dark:text-primary-400 font-medium flex items-center gap-1">
                    {t("viewDetails")} <ChevronRight className="w-3 h-3" />
                  </span>
                  {opp.official_url && (
                    <a
                      href={opp.official_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 px-2 py-0.5 rounded-full transition-colors"
                    >
                      {t("applyNow")}
                    </a>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 card">
          <span className="text-5xl" aria-hidden="true">{meta.emoji}</span>
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-2">{t("noData")}</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            New {meta.label.toLowerCase()} opportunities are added regularly. Check back soon!
          </p>
        </div>
      )}
    </div>
  );
}
