import client from "./client";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "consumed";

export interface ApprovalRequest {
  id: string;
  student_user_id: string;
  parent_user_id: string;
  kind: string;
  reference: string;
  title: string;
  amount: number | null;
  status: ApprovalStatus;
  note: string | null;
  created_at: string;
  decided_at: string | null;
  student_name?: string | null;
}

export interface LinkBadges {
  pending_incoming: number;
  pending_outgoing: number;
  pending_approvals: number;
}

export type MeetingStatus = "pending" | "confirmed" | "declined" | "completed" | "cancelled";

export interface MeetingRequest {
  id: string;
  parent_user_id: string;
  student_user_id: string;
  student_name?: string | null;
  preferred_at: string;
  topic: string;
  notes: string | null;
  status: MeetingStatus;
  scheduled_at: string | null;
  meeting_link: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at?: string;
}

export const parentApi = {
  linkStudent: (parentId: string, body: {
    student_user_id: string;
    relationship: string;
    father_name?: string;
    mother_name?: string;
  }) => client.post(`/v1/users/parents/${parentId}/students`, body),

  getStudents: (parentId: string) =>
    client.get(`/v1/users/parents/${parentId}/students`),

  // The student's own view of every parent-link request against their
  // account (pending and approved) — a link a parent creates starts
  // is_approved=false server-side and grants NO access anywhere until the
  // student approves it via updateLink(linkId, { is_approved: true }).
  getParentLinks: (studentId: string) =>
    client.get(`/v1/users/students/${studentId}/parents`),

  updateLink: (linkId: string, body: Record<string, unknown>) =>
    client.patch(`/v1/users/parents/links/${linkId}`, body),

  removeLink: (linkId: string) =>
    client.delete(`/v1/users/parents/links/${linkId}`),

  studentSummary: (studentId: string, days: 1 | 7 | 30 | 90 | 365 = 7) =>
    client.get(`/v1/analytics/parent/student/${studentId}/summary`, { params: { days } }),

  childrenSummary: (studentIds: string[], days: 7 | 30 | 90 = 30) =>
    client.get("/v1/analytics/parent/children-summary", {
      params: { student_ids: studentIds.join(","), days },
    }),

  studentProgress: (studentId: string) =>
    client.get(`/v1/users/parent/student-progress/${studentId}`),

  getStudyLimits: (childId: string, parentId: string) =>
    client.get(`/v1/users/parent/study-limits/${childId}`, { params: { parent_id: parentId } }),

  setStudyLimit: (childId: string, parentId: string, data: { daily_limit_minutes: number; is_enabled: boolean }) =>
    client.put(`/v1/users/parent/study-limits/${childId}`, data, { params: { parent_id: parentId } }),

  setStudyLimitSimple: (childId: string, dailyLimitMinutes: number) =>
    client.post(`/v1/users/parent/study-limit/${childId}`, { daily_limit_minutes: dailyLimitMinutes }),

  getApprovalRequired: (kind = "purchase") =>
    client.get("/v1/users/parent-approvals/required", { params: { kind } }),

  createApprovalRequest: (body: { kind: string; reference: string; title: string; amount?: number | null }) =>
    client.post("/v1/users/parent-approvals", body),

  myApprovalRequests: () =>
    client.get("/v1/users/parent-approvals/mine"),

  pendingApprovals: () =>
    client.get("/v1/users/parent-approvals/pending"),

  decideApproval: (id: string, body: { status: "approved" | "rejected"; note?: string }) =>
    client.patch(`/v1/users/parent-approvals/${id}`, body),

  linkBadges: () =>
    client.get("/v1/users/me/link-badges"),

  createMeeting: (body: { student_user_id: string; preferred_at: string; topic: string; notes?: string }) =>
    client.post("/v1/users/meetings", body),

  myMeetings: () =>
    client.get("/v1/users/meetings/mine"),

  cancelMeeting: (id: string) =>
    client.delete(`/v1/users/meetings/${id}`),
};
