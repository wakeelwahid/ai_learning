import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "@/store";
import { parentApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { interpolate } from "@/lib/interpolate";
import { formatDayMonYear } from "@/lib/dates";
import { CheckCircle, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Alert, Button, Input, Select } from "@/components/ui";
import { PendingBadge } from "@/components/parent/ChildSelector";
import type { StudentLink } from "@/hooks/useSelectedChild";

// Platform-wide cap enforced server-side in user_service (Settings.
// MAX_STUDENTS_PER_PARENT) — mirrored here only to disable the form and
// show remaining slots before submit; the backend check is the actual
// source of truth and still applies if this ever drifts out of sync.
const MAX_STUDENTS_PER_PARENT = 7;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ParentLinkStudentPage() {
  const { t } = useLanguage();
  const user = useAppSelector(s => s.auth.user);
  const parentId = user?.id ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [studentId, setStudentId] = useState("");
  const [relationship, setRelationship] = useState("father");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [idError, setIdError] = useState<string | null>(null);
  const [done, setDone] = useState<{ studentName: string | null } | null>(null);

  const { data: existingStudents = [] } = useQuery({
    queryKey: ["parent-students", parentId],
    queryFn: () => parentApi.getStudents(parentId).then(r => r.data as StudentLink[]),
    enabled: !!parentId,
  });
  const linkedCount = existingStudents.length;
  const pendingCount = existingStudents.filter(l => !l.is_approved).length;
  const atCap = linkedCount >= MAX_STUDENTS_PER_PARENT;

  const [removingId, setRemovingId] = useState<string | null>(null);
  const removeLink = async (link: StudentLink) => {
    const name = link.student_name?.trim() || t("parentThisStudent");
    const confirmText = link.is_approved
      ? interpolate(t("parentRemoveConfirm"), { name })
      : interpolate(t("parentCancelLinkConfirm"), { name });
    if (!window.confirm(confirmText)) return;
    setRemovingId(link.id);
    try {
      await parentApi.removeLink(link.id);
      toast.success(link.is_approved ? t("parentStudentRemoved") : t("parentLinkRequestCancelled"));
      qc.invalidateQueries({ queryKey: ["parent-students"] });
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setRemovingId(null);
    }
  };

  const linkMutation = useMutation({
    mutationFn: () => parentApi.linkStudent(parentId, {
      student_user_id: studentId.trim(),
      relationship,
      ...(fatherName ? { father_name: fatherName } : {}),
      ...(motherName ? { mother_name: motherName } : {}),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["parent-students"] });
      const name: string | null = res?.data?.student_name ?? null;
      setDone({ studentName: name });
    },
  });

  const submit = () => {
    const id = studentId.trim();
    if (!UUID_RE.test(id)) {
      setIdError(t("parentInvalidStudentId"));
      return;
    }
    setIdError(null);
    linkMutation.mutate();
  };

  const relLabel = (rel: string) =>
    rel === "father" ? t("parentRelFather") : rel === "mother" ? t("parentRelMother") : rel === "guardian" ? t("parentRelGuardian") : rel;

  if (done) {
    const first = done.studentName?.trim() ? done.studentName.trim().split(" ")[0] : t("parentYourChild");
    return (
      <div className="max-w-md mx-auto mt-20 text-center animate-fade-in">
        <div className="w-16 h-16 bg-success-100 dark:bg-success-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-success-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t("parentRequestSent")}</h2>
        <p className="text-sm font-normal text-gray-500 dark:text-gray-400 mb-6">
          {interpolate(t("parentRequestSentDesc"), { name: first })}
        </p>
        <Button onClick={() => navigate("/parent/dashboard")} className="px-8">
          {t("parentGoToDashboard")}
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
          <UserPlus className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t("linkStudent")}</h1>
          <p className="text-sm font-normal text-gray-500 dark:text-gray-400">{t("parentLinkSubtitle")}</p>
        </div>
      </div>

      {existingStudents.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t("parentLinkedStudents")}</h2>
          <div className="space-y-2">
            {existingStudents.map(link => (
              <div key={link.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate flex items-center gap-2">
                    {link.student_name?.trim() || t("parentStudentFallback")}
                    {!link.is_approved && <PendingBadge />}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {interpolate(t("parentRelClassBoard"), {
                      rel: relLabel(link.relationship),
                      cls: link.student_class ?? "–",
                      board: link.student_board ?? "–",
                    })}
                  </p>
                  {link.is_approved && link.approved_at && (
                    <p className="text-xs text-success-600 dark:text-success-400 truncate">
                      {interpolate(t("parentLinkedSince"), { date: formatDayMonYear(link.approved_at) })}
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={removingId === link.id}
                  isLoading={removingId === link.id}
                  onClick={() => removeLink(link)}
                  className="flex-shrink-0"
                >
                  {link.is_approved ? t("parentRemove") : t("parentCancelRequest")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {linkMutation.isError && (
        <Alert variant="danger">{parseApiError(linkMutation.error)}</Alert>
      )}

      {atCap ? (
        <Alert variant="warning">
          {interpolate(t("parentAtCap"), { max: MAX_STUDENTS_PER_PARENT })}
        </Alert>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
          {interpolate(t("parentSlotsUsed"), { used: linkedCount, max: MAX_STUDENTS_PER_PARENT })}
          {pendingCount > 0 ? ` ${interpolate(t("parentSlotsPending"), { n: pendingCount })}` : ""}
        </p>
      )}

      <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-4 ${atCap ? "opacity-50 pointer-events-none" : ""}`}>
        <Input
          label={t("studentUserId")}
          required
          value={studentId}
          onChange={e => { setStudentId(e.target.value); if (idError) setIdError(null); }}
          placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
          helperText={t("parentStudentIdHelp")}
          error={idError ?? undefined}
          disabled={atCap}
        />

        <Select
          label={t("relationship")}
          value={relationship}
          onChange={e => setRelationship(e.target.value)}
          options={[
            { value: "father", label: t("parentRelFather") },
            { value: "mother", label: t("parentRelMother") },
            { value: "guardian", label: t("parentRelGuardian") },
          ]}
          disabled={atCap}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label={t("parentFatherName")} value={fatherName} onChange={e => setFatherName(e.target.value)} placeholder={t("parentOptional")} disabled={atCap} />
          <Input label={t("parentMotherName")} value={motherName} onChange={e => setMotherName(e.target.value)} placeholder={t("parentOptional")} disabled={atCap} />
        </div>

        <Button
          onClick={submit}
          disabled={atCap || !studentId.trim() || linkMutation.isPending}
          isLoading={linkMutation.isPending}
          fullWidth
        >
          {linkMutation.isPending ? t("parentSendingRequest") : t("linkStudentBtn")}
        </Button>
      </div>
    </div>
  );
}
