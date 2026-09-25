from pydantic import BaseModel


class LeaderboardEntry(BaseModel):
    rank:       int
    student_id: str
    score:      float


class LeaderboardResponse(BaseModel):
    class_num: int | str
    entries:   list[LeaderboardEntry]


class SubjectLeaderboardResponse(BaseModel):
    board:      str
    class_num:  int
    subject_id: str
    entries:    list[LeaderboardEntry]
