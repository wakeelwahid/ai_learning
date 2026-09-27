import client from "./client";

export interface StudyQuery {
  query:      string;
  board?:     string;
  class_num?: number;
  subject?:   string;
  chapter?:   string;
  user_id?:   string;
}

export interface MistakeItem {
  question:       string;
  user_answer:    string;
  correct_answer: string;
  topic?:         string;
  subject?:       string;
}

export interface GeneratePaperParams {
  paper_type:  string;
  board?:      string;
  class_num?:  number;
  subject?:    string;
  chapter?:    string;
  difficulty?: string;
  count?:      number;
  title?:      string;
}

export interface ParentChatSource {
  domain: string;
  date:   string;
  text:   string;
  score:  number;
}

export interface ParentChatResponse {
  answer:      string;
  mode:        string;
  from_cache:  boolean;
  llm:         string | null;
  sources:     ParentChatSource[];
  stats_used:  Record<string, any>;
}

export const aiApi = {
  study:          (data: StudyQuery)  => client.post("/v1/ai/study", data),
  chat:           (query: string, history?: { role: string; content: string }[], studentId?: string) =>
    client.post("/v1/ai/chat", { query, history, ...(studentId ? { student_id: studentId } : {}) }),
  // Parent RAG — grounded in the child's real quiz/battle/study/career records.
  // studentId must be an APPROVED linked child; the backend re-checks.
  // The local Ollama model can take 30-120s on a cold first answer, so this one
  // call overrides the client's 30s default instead of raising it globally.
  parentChat:     (query: string, studentId: string, history?: { role: string; content: string }[]) =>
    client.post<ParentChatResponse>("/v1/ai/parent-chat", { query, student_id: studentId, history }, { timeout: 180000 }),
  questions:      (params: { board?: string; class_num?: number; subject?: string; chapter?: string; count?: number; feature?: string }) =>
    client.get("/v1/ai/questions", { params }),
  getPapers:      (params?: object)   => client.get("/v1/ai/papers", { params }),
  generatePaper:  (body: GeneratePaperParams) => client.post("/v1/ai/papers/generate", body),
  getPaper:       (paperId: string) => client.get(`/v1/ai/papers/${paperId}`),
  deletePaper:    (paperId: string) => client.delete(`/v1/ai/papers/${paperId}`),
  // Paper attempts — no user_id (taken from the JWT) and no score: the server
  // grades from the paper's own answer key. Start returns { id }.
  startPaperAttempt:  (paperId: string) => client.post(`/v1/ai/papers/${paperId}/attempts`),
  submitPaperAttempt: (attemptId: string, answers: Record<string, string>, timeTakenSec?: number) =>
    client.patch(`/v1/ai/papers/attempts/${attemptId}`, { answers, time_taken_sec: timeTakenSec }),
  myPaperAttempts:    () => client.get("/v1/ai/papers/attempts/mine"),
  mistakeAnalysis:(mistakes: MistakeItem[], board?: string, class_num?: number) =>
    client.post("/v1/ai/mistake-analysis", { mistakes, board, class_num }),
  flashcards:     (body: { topic: string; subject?: string; chapter?: string; board?: string; class_num?: number; count?: number }) =>
    client.post("/v1/ai/flashcards", body),
  revisionPlan:   (body: { weak_topics: (string | Record<string, unknown>)[]; board?: string; class_num?: number; days?: number }) =>
    client.post("/v1/ai/revision-plan", body),
};
