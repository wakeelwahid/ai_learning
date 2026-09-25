import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import PracticeQuizSession, { PracticeLevel, PracticeMode } from "@/components/practice/PracticeQuizSession";

export default function PracticeQuizPage() {
  const { level, id } = useParams<{ level: PracticeLevel; id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mode      = (searchParams.get("mode") as PracticeMode) || "practice";
  const title     = searchParams.get("title") || (level === "chapter" ? "Chapter" : "Exercise");
  const chapterId = searchParams.get("chapter") || "";

  if (!level || !id) return null;

  return (
    <PracticeQuizSession
      level={level}
      id={id}
      mode={mode}
      title={title}
      chapterId={chapterId}
      onBack={() => navigate(-1)}
      onChapterQuiz={(cid) => navigate(`/quiz?chapter=${cid}`)}
    />
  );
}
