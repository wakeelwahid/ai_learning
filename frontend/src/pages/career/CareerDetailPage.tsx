import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { careerApi } from "@/lib/api";
import {
  ArrowLeft, Target, BookOpen, BarChart3, GraduationCap, MapPin,
  CheckCircle2, Star, Zap, ChevronDown, ChevronUp, Briefcase,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button, Card, Badge } from "@/components/ui";

interface Props {
  career: any;
  userId: string;
  onBack: () => void;
}

const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "History", "Geography", "Economics"];

export default function CareerDetailPage({ career, userId, onBack }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "roadmap" | "skill-gap">("overview");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [goalNotes, setGoalNotes] = useState("");
  const [showGoalForm, setShowGoalForm] = useState(false);

  const { data: latestAssessment } = useQuery({
    queryKey: ["skill-gap", userId, career.id],
    queryFn: () => careerApi.latestAssessment(userId, career.id).then((r) => r.data),
    retry: false,
  });

  const setGoalMutation = useMutation({
    mutationFn: (isPrimary: boolean) => careerApi.setGoal(userId, career.id, isPrimary, goalNotes).then((r) => r.data),
    onSuccess: () => {
      toast.success("Career goal set! +50 XP");
      qc.invalidateQueries({ queryKey: ["career-dashboard"] });
      setShowGoalForm(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to set goal"),
  });

  const skillGapMutation = useMutation({
    mutationFn: () => careerApi.skillGap(userId, career.id, scores).then((r) => r.data),
    onSuccess: () => {
      toast.success("Skill gap analysed! +30 XP");
      qc.invalidateQueries({ queryKey: ["skill-gap", userId, career.id] });
    },
    onError: () => toast.error("Analysis failed"),
  });

  const assessment = skillGapMutation.data ?? latestAssessment;

  const TABS = [
    { id: "overview", label: "Overview", icon: Briefcase },
    { id: "roadmap", label: "Roadmap", icon: MapPin },
    { id: "skill-gap", label: "Skill Gap", icon: BarChart3 },
  ] as const;

  return (
    <div className="w-full space-y-5 animate-fade-in">
      {/* Header */}
      <button onClick={onBack} className="flex items-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="rounded-2xl bg-primary-600 p-4 sm:p-6 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-primary-300 text-xs font-semibold uppercase tracking-wide">{career.category}</p>
            <h1 className="text-2xl font-bold mt-1 break-words">{career.name}</h1>
            <p className="text-primary-200 text-sm mt-2 max-w-lg">{career.overview?.slice(0, 150)}...</p>
          </div>
          <div className="space-y-2 flex-shrink-0">
            {career.avg_salary_lpa && (
              <div className="bg-white/15 rounded-xl px-4 py-2 text-center">
                <p className="text-xs text-primary-300">Avg Salary</p>
                <p className="text-lg font-bold">₹{career.avg_salary_lpa} LPA</p>
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mt-4">
          {career.demand_level && (
            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${career.demand_level === "very_high" ? "bg-success-400/30 text-success-100" : career.demand_level === "high" ? "bg-info-400/30 text-info-100" : "bg-gray-400/30 text-gray-100"}`}>
              {career.demand_level.replace("_", " ")} demand
            </span>
          )}
          {career.required_subjects?.slice(0, 3).map((s: string) => (
            <span key={s} className="text-xs bg-white/15 text-white/80 px-2 py-1 rounded-full">{s}</span>
          ))}
        </div>
      </div>

      {/* Set Goal */}
      {!showGoalForm ? (
        <Button onClick={() => setShowGoalForm(true)} fullWidth className="flex items-center justify-center gap-2 py-3">
          <Target className="w-4 h-4" /> Set as Career Goal (+50 XP)
        </Button>
      ) : (
        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Set Career Goal</h3>
          <textarea
            className="input resize-none"
            rows={2}
            placeholder="Notes (optional)"
            value={goalNotes}
            onChange={(e) => setGoalNotes(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <div className="flex flex-col xs:flex-row gap-2">
              <Button onClick={() => setGoalMutation.mutate(false)} isLoading={setGoalMutation.isPending} className="flex-1 min-w-0 text-sm">
                {setGoalMutation.isPending ? "Saving..." : "Add Goal"}
              </Button>
              <Button onClick={() => setGoalMutation.mutate(true)} disabled={setGoalMutation.isPending} className="flex-1 min-w-0 text-sm">
                Set as Primary
              </Button>
            </div>
            <Button onClick={() => setShowGoalForm(false)} variant="secondary" className="text-sm">Cancel</Button>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === id ? "bg-white dark:bg-gray-700 text-primary-700 dark:text-primary-300 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" /> <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary-500" />Required Subjects</h3>
            <div className="flex flex-wrap gap-2">
              {(career.required_subjects ?? []).map((s: string) => (
                <Badge key={s} variant="primary">{s}</Badge>
              ))}
            </div>
          </Card>

          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Star className="w-4 h-4 text-warning-500" />Key Skills</h3>
            <div className="flex flex-wrap gap-2">
              {(career.key_skills ?? []).map((s: string) => (
                <Badge key={s} variant="warning">{s}</Badge>
              ))}
            </div>
          </Card>

          {career.entrance_exams?.length > 0 && (
            <Card className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2"><GraduationCap className="w-4 h-4 text-primary-500" />Entrance Exams</h3>
              <div className="flex flex-wrap gap-2">
                {career.entrance_exams.map((e: string) => (
                  <Badge key={e} variant="primary">{e}</Badge>
                ))}
              </div>
            </Card>
          )}

          {career.top_colleges?.length > 0 && (
            <Card className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2"><MapPin className="w-4 h-4 text-success-500" />Top Colleges</h3>
              <ul className="space-y-1">
                {career.top_colleges.slice(0, 6).map((c: string) => (
                  <li key={c} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-success-400 flex-shrink-0" />{c}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === "roadmap" && (
        <div className="space-y-3">
          {(career.roadmap ?? []).map((step: any, i: number) => (
            <Card key={i}>
              <button
                className="w-full flex items-center gap-3 text-left"
                onClick={() => setExpanded(expanded === i ? null : i)}
              >
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-bold text-sm flex items-center justify-center flex-shrink-0">{i + 1}</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{step.step}</p>
                  {step.duration && <p className="text-xs text-gray-400 dark:text-gray-500">{step.duration}</p>}
                </div>
                {expanded === i ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {expanded === i && step.details && (
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed pl-11">{step.details}</p>
              )}
            </Card>
          ))}
          {(!career.roadmap || career.roadmap.length === 0) && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Roadmap coming soon.</p>
          )}
        </div>
      )}

      {tab === "skill-gap" && (
        <div className="space-y-4">
          {/* Score sliders */}
          {!assessment && (
            <Card className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Rate Your Subject Knowledge (0–100%)</h3>
              <div className="space-y-3">
                {SUBJECTS.map((subj) => (
                  <div key={subj}>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>{subj}</span>
                      <span className="font-semibold text-primary-600 dark:text-primary-400">{scores[subj] ?? 50}%</span>
                    </div>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={scores[subj] ?? 50}
                      onChange={(e) => setScores((s) => ({ ...s, [subj]: +e.target.value }))}
                      className="w-full accent-primary-600"
                    />
                  </div>
                ))}
              </div>
              <Button
                onClick={() => skillGapMutation.mutate()}
                isLoading={skillGapMutation.isPending}
                fullWidth
                className="flex items-center justify-center gap-2"
              >
                {skillGapMutation.isPending ? "Analysing..." : <><Zap className="w-4 h-4" />Analyse Skill Gap (+30 XP)</>}
              </Button>
            </Card>
          )}

          {assessment && (
            <div className="space-y-4">
              {/* Ready score */}
              <Card className="text-center">
                <p className="text-4xl font-bold text-primary-600 dark:text-primary-400">{assessment.ready_score}%</p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Career Readiness Score</p>
                <div className="mt-3 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${assessment.ready_score}%` }} />
                </div>
              </Card>

              {/* Per-subject scores */}
              {assessment.skill_scores && (
                <Card className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Subject Scores</h3>
                  {Object.entries(assessment.skill_scores as Record<string, number>).map(([subj, sc]) => (
                    <div key={subj}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-700 dark:text-gray-300">{subj}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{sc}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${sc >= 70 ? "bg-success-500" : sc >= 40 ? "bg-warning-500" : "bg-danger-500"}`} style={{ width: `${sc}%` }} />
                      </div>
                    </div>
                  ))}
                </Card>
              )}

              {/* Gaps */}
              {assessment.gaps?.length > 0 && (
                <Card className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Skill Gaps</h3>
                  {assessment.gaps.map((g: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-danger-600 dark:text-danger-400">
                      <span className="text-danger-400 flex-shrink-0">●</span> {g}
                    </div>
                  ))}
                </Card>
              )}

              {/* Learning path */}
              {assessment.learning_path?.length > 0 && (
                <Card className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Zap className="w-4 h-4 text-warning-500" />Recommended Learning Path</h3>
                  {assessment.learning_path.map((step: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span> {step}
                    </div>
                  ))}
                </Card>
              )}

              <Button
                onClick={() => { skillGapMutation.reset(); }}
                variant="secondary"
                fullWidth
                className="text-sm"
              >
                Re-analyse
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
