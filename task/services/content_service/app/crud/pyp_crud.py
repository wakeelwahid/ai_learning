import uuid
from datetime import datetime, timezone

from sqlalchemy import func as sqlfunc
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    DifficultyLevel,
    PreviousYearPaper,
    PypAttempt,
    PypPracticeQuestion,
)
from app.schemas.content import (
    PypPracticeQuestionCreate,
    PYPCreate,
    PYPUpdate,
)


async def list_pyps(
    db: AsyncSession,
    board: str | None,
    class_num: int | None,
    subject: str | None,
    year: int | None,
    exam_type: str | None,
    limit: int,
    offset: int,
) -> dict:
    q = select(PreviousYearPaper).where(PreviousYearPaper.is_active == True)  # noqa: E712
    # A paper's own board/class_num being NULL means "for everyone" on that
    # axis, so it must still match a caller's filter.
    if board:
        q = q.where(or_(PreviousYearPaper.board.is_(None), PreviousYearPaper.board.ilike(f"%{board}%")))
    if class_num:
        q = q.where(or_(PreviousYearPaper.class_num.is_(None), PreviousYearPaper.class_num == class_num))
    if subject:
        q = q.where(PreviousYearPaper.subject.ilike(f"%{subject}%"))
    if year:
        q = q.where(PreviousYearPaper.year == year)
    if exam_type:
        q = q.where(PreviousYearPaper.exam_type == exam_type)
    q = q.order_by(PreviousYearPaper.year.desc(), PreviousYearPaper.board).offset(offset).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    total = (await db.execute(select(PreviousYearPaper).where(PreviousYearPaper.is_active == True))).scalars().all()  # noqa: E712
    return {"papers": rows, "total": len(total)}


async def create_pyp(db: AsyncSession, body: PYPCreate) -> PreviousYearPaper:
    paper = PreviousYearPaper(**body.model_dump())
    db.add(paper)
    await db.commit()
    await db.refresh(paper)
    return paper


async def get_pyp(db: AsyncSession, paper_id: uuid.UUID) -> PreviousYearPaper | None:
    return (await db.execute(select(PreviousYearPaper).where(PreviousYearPaper.id == paper_id))).scalar_one_or_none()


async def update_pyp(db: AsyncSession, paper: PreviousYearPaper, body: PYPUpdate) -> PreviousYearPaper:
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(paper, k, v)
    await db.commit()
    return paper


async def deactivate_pyp(db: AsyncSession, paper: PreviousYearPaper) -> None:
    paper.is_active = False
    await db.commit()


# ─── Knowledge Hub ─────────────────────────────────────────────────────────────


async def get_pyp_practice_questions(db: AsyncSession, topic_name: str | None) -> list[PypPracticeQuestion]:
    stmt = select(PypPracticeQuestion).where(PypPracticeQuestion.is_active == True)  # noqa: E712
    if topic_name:
        stmt = stmt.where(PypPracticeQuestion.topic_name.ilike(topic_name))
    stmt = stmt.order_by(PypPracticeQuestion.topic_name, PypPracticeQuestion.sequence)
    result = await db.execute(stmt)
    return result.scalars().all()


async def create_pyp_practice_question(db: AsyncSession, body: PypPracticeQuestionCreate) -> PypPracticeQuestion:
    # body.difficulty is validated + normalized to lowercase by
    # PypPracticeQuestionCreate._validate_difficulty — safe to convert directly.
    diff = DifficultyLevel(body.difficulty)
    q = PypPracticeQuestion(
        topic_name=body.topic_name.strip(),
        text=body.text.strip(),
        option_a=body.option_a.strip(),
        option_b=body.option_b.strip(),
        option_c=body.option_c.strip() if body.option_c else None,
        option_d=body.option_d.strip() if body.option_d else None,
        correct_option=body.correct_option.upper(),
        explanation=body.explanation,
        difficulty=diff,
        sequence=body.sequence,
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return q


async def get_pyp_practice_question(db: AsyncSession, question_id: uuid.UUID) -> PypPracticeQuestion | None:
    return await db.get(PypPracticeQuestion, question_id)


async def update_pyp_practice_question(
    db: AsyncSession, q: PypPracticeQuestion, body: PypPracticeQuestionCreate
) -> PypPracticeQuestion:
    diff = DifficultyLevel(body.difficulty)
    q.topic_name = body.topic_name.strip()
    q.text = body.text.strip()
    q.option_a = body.option_a.strip()
    q.option_b = body.option_b.strip()
    q.option_c = body.option_c.strip() if body.option_c else None
    q.option_d = body.option_d.strip() if body.option_d else None
    q.correct_option = body.correct_option.upper()
    q.explanation = body.explanation
    q.difficulty = diff
    q.sequence = body.sequence
    await db.commit()
    await db.refresh(q)
    return q


async def delete_pyp_practice_question(db: AsyncSession, q: PypPracticeQuestion) -> None:
    await db.delete(q)
    await db.commit()


async def count_pyp_practice_questions(db: AsyncSession) -> int:
    return (await db.execute(select(sqlfunc.count()).select_from(PypPracticeQuestion))).scalar()


async def seed_pyp_practice_questions(db: AsyncSession) -> int:
    """Bulk-insert the default CBSE/NCERT PYP practice question bank. Returns count created."""
    SEED_DATA = [
        # Electricity
        ("Electricity","What is the SI unit of electric current?","Volt","Ampere","Ohm","Watt","B","Ampere (A) is the SI unit of electric current."),
        ("Electricity","Ohm's Law is expressed as:","V = IR","I = VR","R = VI","P = IV²","A","Ohm's Law: V = IR."),
        ("Electricity","When resistors are in series, total resistance is:","Less than smallest","Sum of all","Product","Equal to largest","B","R_total = R₁ + R₂ + ... in series."),
        ("Electricity","Which device measures potential difference?","Ammeter","Galvanometer","Voltmeter","Rheostat","C","A Voltmeter measures potential difference and is connected in parallel."),
        # Magnetism
        ("Magnetism","Magnetic field lines run from (outside magnet):","S to N","N to S","N to N","S to S","B","Outside the magnet, field lines go from North to South."),
        ("Magnetism","Which rule gives force on a current-carrying conductor in a magnetic field?","Ampere's rule","Fleming's Left Hand Rule","Lenz's Law","Faraday's Rule","B","Fleming's Left Hand Rule: thumb=force, index=field, middle=current."),
        ("Magnetism","Electromagnetic induction was discovered by:","Volta","Oersted","Faraday","Maxwell","C","Michael Faraday discovered electromagnetic induction in 1831."),
        # Light
        ("Light","Angle of incidence = angle of reflection. This is:","Snell's Law","Law of Reflection","Law of Refraction","Total Internal Reflection","B","The Law of Reflection states angle of incidence = angle of reflection."),
        ("Light","A concave mirror has focal length 10 cm. Radius of curvature is:","5 cm","10 cm","20 cm","40 cm","C","Radius of curvature = 2 × focal length = 20 cm."),
        ("Light","Light travels fastest in:","Water","Glass","Diamond","Vacuum","D","Light travels at 3×10⁸ m/s in vacuum."),
        # Real Numbers
        ("Real Numbers","Every composite number expressed as product of primes is:","Euclid's Division Lemma","Fundamental Theorem of Arithmetic","HCF Theorem","LCM Property","B","The Fundamental Theorem of Arithmetic states every composite number has a unique prime factorisation."),
        ("Real Numbers","HCF × LCM = ?","Sum of two numbers","Difference","Product of two numbers","Square","C","HCF(a,b) × LCM(a,b) = a × b."),
        ("Real Numbers","√2 is:","Rational","Irrational","Natural Number","Integer","B","√2 is irrational — cannot be expressed as p/q."),
        # Trigonometry
        ("Trigonometry","sin²θ + cos²θ = ?","0","2","1","sinθ × cosθ","C","Pythagorean identity: sin²θ + cos²θ = 1."),
        ("Trigonometry","Value of tan 45°:","0","1","√3","1/√2","B","tan 45° = 1."),
        ("Trigonometry","sec θ is defined as:","1/sinθ","1/cosθ","sinθ/cosθ","cosθ/sinθ","B","sec θ = 1/cos θ."),
        # Chemical Reactions
        ("Chemical Reactions","A compound breaks into simpler substances. This is:","Combination","Decomposition","Displacement","Redox","B","Decomposition: AB → A + B."),
        ("Chemical Reactions","Rusting of iron is a:","Physical change","Decomposition","Oxidation reaction","Neutralisation","C","Rusting is oxidation: 4Fe + 3O₂ + 6H₂O → 4Fe(OH)₃."),
        ("Chemical Reactions","In a balanced equation, what is conserved?","Only mass","Only charge","Both mass and charge","Volume","C","Both mass and charge are conserved."),
        # Acids & Bases
        ("Acids & Bases","pH of neutral solution at 25°C:","0","7","14","10","B","pH = 7 for neutral solutions."),
        ("Acids & Bases","Litmus paper turns red in:","Base","Neutral solution","Acid","Salt solution","C","Acids turn blue litmus red."),
        ("Acids & Bases","Which is a strong acid?","Acetic acid","Carbonic acid","Hydrochloric acid","Citric acid","C","HCl completely dissociates in water."),
        # Algebra
        ("Algebra","Discriminant of ax² + bx + c = 0 is:","b² - 4ac","b² + 4ac","4ac - b²","√(b² - 4ac)","A","D = b² - 4ac."),
        ("Algebra","Roots of x² - 5x + 6 = 0:","2, 3","1, 6","-2, -3","5, 1","A","(x-2)(x-3)=0, roots are 2 and 3."),
        # Life Processes
        ("Life Processes","Which organ produces bile?","Pancreas","Stomach","Liver","Kidney","C","Liver produces bile stored in the gall bladder."),
        ("Life Processes","Main function of xylem:","Carry food","Carry water and minerals","Produce oxygen","Store starch","B","Xylem transports water and minerals upward."),
        ("Life Processes","Photosynthesis occurs in:","Mitochondria","Ribosome","Chloroplast","Nucleus","C","Photosynthesis takes place in chloroplasts."),
        # Statistics
        ("Statistics","Middle value of ordered data set:","Mean","Mode","Median","Range","C","Median is the middle value when data is ordered."),
        ("Statistics","Most frequently occurring value:","Mean","Mode","Median","Average","B","Mode is the most frequent value."),
        # Probability
        ("Probability","Probability of a certain event:","0","0.5","1","Between 0 and 1","C","P(certain event) = 1."),
        ("Probability","Sum of all outcome probabilities:","0","0.5","Greater than 1","1","D","Sum of all probabilities = 1."),
    ]

    created = 0
    for i, row in enumerate(SEED_DATA):
        topic, text, a, b, c, d, correct, expl = row
        q = PypPracticeQuestion(
            topic_name=topic, text=text,
            option_a=a, option_b=b, option_c=c, option_d=d,
            correct_option=correct, explanation=expl,
            difficulty=DifficultyLevel.MEDIUM, sequence=i,
        )
        db.add(q)
        created += 1

    await db.commit()
    return created


# ── Dashboard video feeds (raw SQL) ────────────────────────────────────────────


# ── PYP attempts ───────────────────────────────────────────────────────────────

async def get_paper_questions(db: AsyncSession, paper: PreviousYearPaper) -> list[PypPracticeQuestion]:
    """Practice questions belonging to a paper. PypPracticeQuestion has no
    paper FK — it is keyed by topic_name — so a paper's questions are the ones
    whose topic is listed in the paper's tags["topics"]. Papers without topics
    have no machine-checkable key and grade to zero questions."""
    topics = (paper.tags or {}).get("topics") or []
    if not topics:
        return []
    stmt = (
        select(PypPracticeQuestion)
        .where(PypPracticeQuestion.is_active == True, PypPracticeQuestion.topic_name.in_(topics))  # noqa: E712
        .order_by(PypPracticeQuestion.topic_name, PypPracticeQuestion.sequence)
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_pyp_attempt(db: AsyncSession, user_id: uuid.UUID, paper: PreviousYearPaper) -> PypAttempt:
    attempt = PypAttempt(
        user_id=user_id,
        pyp_id=paper.id,
        subject=paper.subject,
        board=paper.board,
        class_num=paper.class_num,
        year=paper.year,
        exam_type=paper.exam_type,
        questions_total=len(await get_paper_questions(db, paper)),
        status="in_progress",
        started_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return attempt


async def get_pyp_attempt(db: AsyncSession, attempt_id: uuid.UUID) -> PypAttempt | None:
    return await db.get(PypAttempt, attempt_id)


async def submit_pyp_attempt(
    db: AsyncSession, attempt: PypAttempt, answers: dict[str, str], time_taken_sec: int | None
) -> PypAttempt:
    """Grade against the paper's practice questions. Only answered questions
    that match a real question row count; unanswered ones are wrong."""
    paper = await get_pyp(db, attempt.pyp_id)
    questions = await get_paper_questions(db, paper) if paper else []

    correct = sum(
        1 for q in questions
        if answers.get(str(q.id), "").strip().upper() == q.correct_option.upper()
    )
    attempt.questions_total = len(questions)
    attempt.correct_count = correct
    attempt.wrong_count = len(questions) - correct
    attempt.percentage = round(correct / len(questions) * 100, 2) if questions else 0.0
    attempt.time_taken_sec = time_taken_sec
    attempt.status = "completed"
    attempt.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(attempt)
    return attempt


async def list_pyp_attempts(
    db: AsyncSession, user_id: uuid.UUID, limit: int, since: datetime | None = None
) -> list[PypAttempt]:
    stmt = select(PypAttempt).where(PypAttempt.user_id == user_id)
    if since:
        stmt = stmt.where(PypAttempt.created_at >= since)
    stmt = stmt.order_by(PypAttempt.created_at.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def get_student_pyp_totals(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """All-time totals — averages only over completed attempts, so an abandoned
    sitting doesn't drag a parent's view of the average down."""
    attempts, avg = (await db.execute(
        select(
            sqlfunc.count(),
            sqlfunc.avg(PypAttempt.percentage).filter(PypAttempt.status == "completed"),
        ).where(PypAttempt.user_id == user_id)
    )).one()
    papers_opened = (await db.execute(
        select(sqlfunc.count(sqlfunc.distinct(PypAttempt.pyp_id))).where(PypAttempt.user_id == user_id)
    )).scalar()
    return {
        "attempts": attempts,
        "avg_percentage": round(float(avg), 2) if avg is not None else None,
        "papers_opened": papers_opened,
    }
