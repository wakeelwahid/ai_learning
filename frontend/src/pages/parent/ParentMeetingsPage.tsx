import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Calendar, CalendarPlus, ExternalLink, Users } from "lucide-react";
import BackButton from "@/components/ui/BackButton";
import { Alert, Button, Card, EmptyState, Input, Textarea } from "@/components/ui";
import { useLanguage } from "@/contexts/LanguageContext";
import { parentApi } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { interpolate } from "@/lib/interpolate";
import { formatDateTime, toDatetimeLocalValue, tomorrowStart } from "@/lib/dates";
import { useSelectedChild } from "@/hooks/useSelectedChild";
import { ChildSelector, NoChildrenState } from "@/components/parent/ChildSelector";
import StatusChip from "@/components/parent/StatusChip";

interface MeetingRequest {
  id: string;
  student_user_id: string;
  student_name: string | null;
  preferred_at: string;
  topic: string;
  notes: string | null;
  status: "pending" | "confirmed" | "declined" | "completed" | "cancelled";
  scheduled_at: string | null;
  meeting_link: string | null;
  admin_note: string | null;
  created_at: string;
}

const TOPIC_MAX = 200;

export default function ParentMeetingsPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { children: students, approvedChildren, selectedChildId, setSelectedChildId, isLoading } = useSelectedChild();

  const minValue = toDatetimeLocalValue(tomorrowStart());
  const [preferredAt, setPreferredAt] = useState("");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const selectedApproved = approvedChildren.find(c => c.student_user_id === selectedChildId) ?? approvedChildren[0] ?? null;

  const { data: meetings = [] } = useQuery({
    queryKey: ["parent-meetings"],
    queryFn: () => parentApi.myMeetings().then(r => (r.data ?? []) as MeetingRequest[]),
  });

  const createMutation = useMutation({
    mutationFn: () => parentApi.createMeeting({
      student_user_id: selectedApproved!.student_user_id,
      preferred_at: new Date(preferredAt).toISOString(),
      topic: topic.trim(),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }),
    onSuccess: () => {
      toast.success(t("parentMeetingRequested"));
      setPreferredAt("");
      setTopic("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["parent-meetings"] });
    },
  });

  const cancel = async (m: MeetingRequest) => {
    if (!window.confirm(t("parentMeetingCancelConfirm"))) return;
    setCancellingId(m.id);
    try {
      await parentApi.cancelMeeting(m.id);
      toast.success(t("parentMeetingCancelled"));
      qc.invalidateQueries({ queryKey: ["parent-meetings"] });
    } catch (err) {
      toast.error(parseApiError(err));
    } finally {
      setCancellingId(null);
    }
  };

  const canSubmit = !!selectedApproved && preferredAt >= minValue && topic.trim().length > 0 && topic.length <= TOPIC_MAX;

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <BackButton label={t("parentBack")} />
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary-500" /> {t("bookMeeting")}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("parentMeetingsSubtitle")}</p>
      </div>

      {!isLoading && students.length === 0 && <NoChildrenState />}

      {students.length > 0 && (
        <Card noPadding className="overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-primary-500 flex-shrink-0" />
            <h2 className="font-bold text-gray-900 dark:text-white">{t("parentMeetingNewRequest")}</h2>
          </div>
          {approvedChildren.length === 0 ? (
            <div className="p-5">
              <Alert variant="warning">{t("parentMeetingNeedApproved")}</Alert>
            </div>
          ) : (
            <>
              <ChildSelector
                children={approvedChildren}
                selectedChildId={selectedApproved?.student_user_id ?? null}
                onSelect={setSelectedChildId}
                showAdd={false}
                compact
              />
              <div className="p-5 space-y-4">
                <Input
                  type="datetime-local"
                  label={t("parentMeetingPreferredAt")}
                  required
                  min={minValue}
                  value={preferredAt}
                  onChange={e => setPreferredAt(e.target.value)}
                  helperText={t("parentMeetingPreferredHelp")}
                />
                <Input
                  label={t("parentMeetingTopic")}
                  required
                  maxLength={TOPIC_MAX}
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder={t("parentMeetingTopicPlaceholder")}
                  helperText={`${topic.length}/${TOPIC_MAX}`}
                />
                <Textarea
                  label={t("parentMeetingNotes")}
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={t("parentMeetingNotesPlaceholder")}
                />
                {createMutation.isError && (
                  <Alert variant="danger">{parseApiError(createMutation.error)}</Alert>
                )}
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!canSubmit || createMutation.isPending}
                  isLoading={createMutation.isPending}
                  fullWidth
                >
                  {t("parentMeetingSubmit")}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      <Card noPadding className="overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary-500 flex-shrink-0" />
          <h2 className="font-bold text-gray-900 dark:text-white">{t("parentMeetingMyRequests")}</h2>
        </div>
        {meetings.length === 0 ? (
          <EmptyState icon={Calendar} title={t("parentMeetingNoRequests")} description={t("parentMeetingNoRequestsDesc")} />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {meetings.map(m => {
              const cancellable = m.status === "pending" || m.status === "confirmed";
              return (
                <div key={m.id} className="p-4 sm:p-5 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{m.topic}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {m.student_name?.trim() || t("parentStudentFallback")}
                        {" · "}
                        {interpolate(t("parentRequestedOn"), { when: formatDateTime(m.created_at) })}
                      </p>
                    </div>
                    <StatusChip status={m.status} />
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    {m.status === "confirmed" && m.scheduled_at
                      ? interpolate(t("parentMeetingScheduledFor"), { when: formatDateTime(m.scheduled_at) })
                      : interpolate(t("parentMeetingPreferredLabel"), { when: formatDateTime(m.preferred_at) })}
                  </p>
                  {m.admin_note && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 break-words">
                      <span className="font-semibold">{t("parentMeetingAdminNote")}:</span> {m.admin_note}
                    </p>
                  )}
                  {(cancellable || (m.status === "confirmed" && m.meeting_link)) && (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {m.status === "confirmed" && m.meeting_link && (
                        <a
                          href={m.meeting_link}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-primary btn-sm inline-flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> {t("parentMeetingJoin")}
                        </a>
                      )}
                      {cancellable && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={cancellingId === m.id}
                          isLoading={cancellingId === m.id}
                          onClick={() => cancel(m)}
                        >
                          {t("parentMeetingCancel")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
