import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { opportunityApi } from "@/lib/api";
import {
  ArrowLeft, ChevronRight, AlertCircle, ExternalLink,
  FileText, Calendar, Users, DollarSign, GraduationCap,
  IndianRupee, CheckCircle, Clock,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui";

function daysLeft(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export default function OpportunityDetailPage() {
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();

  const { data: opp, isLoading, isError } = useQuery({
    queryKey: ["opp-detail", id],
    queryFn: () => opportunityApi.get(id!).then(r => r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="w-full animate-fade-in space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse" />
        <div className="card space-y-3 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-5 bg-gray-200 dark:bg-gray-700 rounded" style={{ width: `${60 + (i * 7) % 30}%` }} />
          ))}
          <p className="sr-only">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (isError || !opp) {
    return (
      <div className="w-full text-center py-16">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="font-bold text-gray-900 dark:text-white mb-2">Opportunity not found</h2>
        <Link to="/careers" className="text-primary-600 dark:text-primary-400 hover:underline">
          Back to Career Hub
        </Link>
      </div>
    );
  }

  const days = daysLeft(opp.last_date);
  const closed = days < 0;

  const deadlineColor = closed
    ? { bg: "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700", text: "text-gray-500 dark:text-gray-400", sub: "text-gray-400" }
    : days <= 7
    ? { bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800", text: "text-red-600 dark:text-red-400", sub: "text-red-400 dark:text-red-500" }
    : { bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800", text: "text-green-600 dark:text-green-400", sub: "text-green-500 dark:text-green-500" };

  return (
    <div className="w-full animate-fade-in space-y-6 pb-8">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
        <Link to="/careers" className="flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t("back")}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to={`/careers/${opp.category}`} className="hover:text-primary-600 dark:hover:text-primary-400 capitalize transition-colors">
          {opp.category.replace(/_/g, " ")}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 dark:text-white font-medium truncate min-w-0 max-w-full">{opp.title}</span>
      </div>

      {/* ── 2-col at xl: left = details, right = sticky sidebar ── */}
      <div className="xl:flex xl:gap-8 xl:items-start">

        {/* ── LEFT COLUMN ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Hero */}
          <div className="card">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant="primary" className="uppercase tracking-wide">
                    {opp.subcategory.replace(/_/g, " ")}
                  </Badge>
                  {opp.is_featured && (
                    <Badge variant="warning" className="text-[10px]">⭐ Featured</Badge>
                  )}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white leading-snug">{opp.title}</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">{opp.organization}</p>
              </div>

              {/* Deadline badge — mobile only */}
              <div className={`xl:hidden flex-shrink-0 text-center px-4 py-3 rounded-xl border ${deadlineColor.bg}`}>
                {closed ? (
                  <p className={`text-sm font-semibold ${deadlineColor.text}`}>Closed</p>
                ) : (
                  <>
                    <p className={`text-2xl font-bold ${deadlineColor.text}`}>{days}</p>
                    <p className={`text-xs font-medium ${deadlineColor.sub}`}>days left</p>
                  </>
                )}
              </div>
            </div>

            {opp.description && (
              <p className="mt-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-4">
                {opp.description}
              </p>
            )}
          </div>

          {/* Key Details */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Key Details</h2>
            <div>
              {opp.total_posts && (
                <InfoRow icon={Users} label={t("totalPosts")} value={opp.total_posts.toLocaleString("en-IN")} />
              )}
              {opp.qualification && (
                <InfoRow icon={GraduationCap} label="Qualification" value={opp.qualification} />
              )}
              {(opp.age_min || opp.age_max) && (
                <InfoRow
                  icon={Users}
                  label="Age Range"
                  value={`${opp.age_min ?? "—"}–${opp.age_max ?? "—"} years`}
                />
              )}
              {(opp.salary_min || opp.salary_max) && (
                <InfoRow
                  icon={IndianRupee}
                  label="Salary Range"
                  value={`₹${(opp.salary_min ?? 0).toLocaleString("en-IN")} – ₹${(opp.salary_max ?? 0).toLocaleString("en-IN")} / month`}
                />
              )}
              <InfoRow
                icon={DollarSign}
                label={t("applicationFee")}
                value={
                  opp.application_fee === 0 || opp.application_fee === null
                    ? "No fee / Free"
                    : `₹${opp.application_fee}`
                }
              />
              <InfoRow
                icon={Calendar}
                label={t("lastDate")}
                value={new Date(opp.last_date).toLocaleDateString("en-IN", {
                  day: "numeric", month: "long", year: "numeric",
                })}
              />
              {opp.exam_date && (
                <InfoRow
                  icon={Calendar}
                  label="Exam Date"
                  value={new Date(opp.exam_date).toLocaleDateString("en-IN", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                />
              )}
            </div>
          </div>

          {/* Selection Process */}
          {opp.selection_process?.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Selection Process</h2>
              <ol className="space-y-3">
                {opp.selection_process.map((step: string, i: number) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 pt-0.5">{step}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Actions — mobile/tablet only */}
          <div className="xl:hidden flex flex-col sm:flex-row gap-3">
            {opp.notification_pdf_url && (
              <a
                href={opp.notification_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <FileText className="w-4 h-4" />
                {t("downloadPdf")}
              </a>
            )}
            {!closed && opp.official_url && (
              <a
                href={opp.official_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-colors flex-1"
              >
                {t("applyNow")}
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {closed && (
              <div className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-semibold text-sm cursor-not-allowed flex-1">
                Applications Closed
              </div>
            )}
          </div>

          {/* Disclaimer — mobile */}
          <p className="xl:hidden text-xs text-gray-400 dark:text-gray-500 text-center leading-relaxed">
            Always verify details on the official website before applying. EduLearn is not responsible for any discrepancies.
          </p>

        </div>{/* end left */}

        {/* ── RIGHT SIDEBAR (xl+) ── */}
        <aside className="hidden xl:flex flex-col w-72 2xl:w-80 flex-shrink-0 sticky top-6 self-start space-y-4">

          {/* Deadline + CTA card */}
          <div className="card space-y-4">
            {/* Deadline ring */}
            <div className={`rounded-2xl border-2 py-6 text-center ${deadlineColor.bg}`}>
              {closed ? (
                <>
                  <p className={`text-xl font-bold ${deadlineColor.text}`}>Applications Closed</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Deadline has passed</p>
                </>
              ) : (
                <>
                  <p className={`text-5xl font-extrabold leading-none ${deadlineColor.text}`}>{days}</p>
                  <p className={`text-sm font-semibold mt-1 ${deadlineColor.sub}`}>days remaining</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" />
                    Closes {new Date(opp.last_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              {!closed && opp.official_url && (
                <a
                  href={opp.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-colors shadow-sm shadow-primary-200 dark:shadow-none"
                >
                  {t("applyNow")} <ExternalLink className="w-4 h-4" />
                </a>
              )}
              {closed && (
                <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-semibold text-sm cursor-not-allowed">
                  Applications Closed
                </div>
              )}
              {opp.notification_pdf_url && (
                <a
                  href={opp.notification_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <FileText className="w-4 h-4" /> {t("downloadPdf")}
                </a>
              )}
            </div>
          </div>

          {/* Key facts summary */}
          <div className="card">
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Quick Facts</p>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5">
                <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">Application Fee</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {opp.application_fee === 0 || opp.application_fee === null ? "Free" : `₹${opp.application_fee}`}
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">Last Date</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {new Date(opp.last_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              </li>
              {opp.exam_date && (
                <li className="flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">Exam Date</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {new Date(opp.exam_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </li>
              )}
              {opp.total_posts && (
                <li className="flex items-start gap-2.5">
                  <Users className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">Total Posts</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {opp.total_posts.toLocaleString("en-IN")}
                    </p>
                  </div>
                </li>
              )}
            </ul>
          </div>

          {/* Application tips */}
          <div className="card">
            <p className="text-xs font-bold text-gray-900 dark:text-white mb-3">Application Tips</p>
            <ul className="space-y-2.5">
              {[
                "Verify your eligibility before applying",
                "Keep documents ready — mark sheets, ID proof, photo",
                "Apply early to avoid last-minute server rush",
                "Save your application number / confirmation",
                "Always check the official website for updates",
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Disclaimer */}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center leading-relaxed px-1">
            Always verify details on the official website. EduLearn is not responsible for any discrepancies.
          </p>

        </aside>

      </div>{/* end 2-col */}
    </div>
  );
}
