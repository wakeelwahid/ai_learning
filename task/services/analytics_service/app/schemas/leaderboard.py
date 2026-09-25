from typing import List

from pydantic import BaseModel


class LeaderboardEntry(BaseModel):
    rank: int
    student_id: str
    score: float


class ClassLeaderboardResponse(BaseModel):
    class_num: int
    entries: List[LeaderboardEntry]


class StudentRankResponse(BaseModel):
    student_id: str
    class_num: int
    rank: int | None
    score: float
    total_students: int
