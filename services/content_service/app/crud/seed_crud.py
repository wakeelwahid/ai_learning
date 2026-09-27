import uuid
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import (
    Chapter,
    ContentBoard,
    ContentClass,
    DifficultyLevel,
    Exercise,
    KnowledgeArticle,
    KnowledgeCategory,
    Note,
    PracticeQuestion,
    PreviousYearPaper,
    Question,
    Subject,
    Topic,
    UserLearningProgress,
    Video,
    VideoProgress,
)


async def seed_demo_data(db: AsyncSession, user_id: uuid.UUID | None = None) -> dict:

    existing = (await db.execute(select(ContentBoard).where(ContentBoard.code == "CBSE"))).scalar_one_or_none()
    if existing is not None:
        # Board already seeded — only add progress records if user_id given and none exist yet
        if user_id:
            await seed_progress_for_user(db, user_id)
        return {"already_seeded": True, "message": "Demo data already exists"}

    board = ContentBoard(name="CBSE", code="CBSE")
    db.add(board)
    await db.flush()

    cls = ContentClass(board_id=board.id, name="Class 10", number=10)
    db.add(cls)
    await db.flush()

    math = Subject(class_id=cls.id, name="Mathematics", code="MATH", icon_url=None)
    eng = Subject(class_id=cls.id, name="English", code="ENG", icon_url=None)
    db.add(math)
    db.add(eng)
    await db.flush()

    math_ch1 = Chapter(subject_id=math.id, title="Real Numbers", sequence=1)
    math_ch2 = Chapter(subject_id=math.id, title="Polynomials", sequence=2)
    math_ch3 = Chapter(subject_id=math.id, title="Quadratic Equations", sequence=3)
    eng_ch1 = Chapter(subject_id=eng.id, title="A Letter to God", sequence=1)
    eng_ch2 = Chapter(subject_id=eng.id, title="Nelson Mandela", sequence=2)
    eng_ch3 = Chapter(subject_id=eng.id, title="Two Stories About Flying", sequence=3)
    for ch in (math_ch1, math_ch2, math_ch3, eng_ch1, eng_ch2, eng_ch3):
        db.add(ch)
    await db.flush()

    topic_map = {}
    for ch in (math_ch1, math_ch2, math_ch3, eng_ch1, eng_ch2, eng_ch3):
        t = Topic(chapter_id=ch.id, title="General", sequence=0, difficulty="medium")
        db.add(t)
        topic_map[ch.id] = t
    await db.flush()

    videos_data = [
        (math_ch1, "Introduction to Real Numbers", "uTwnZSiTgGE", 845, 1),
        (math_ch1, "Euclid's Division Algorithm", "AuX7nPBqDts", 712, 2),
        (math_ch2, "Introduction to Polynomials", "e0NWAHIkFHE", 632, 1),
        (math_ch2, "Zeroes of Polynomials", "4RAjCH7WBKY", 754, 2),
        (math_ch3, "Introduction to Quadratic Equations", "IWigSB_zOeY", 913, 1),
        (math_ch3, "Solving by Factorisation", "2ZzuZvz33X0", 687, 2),
        (eng_ch1, "A Letter to God - Full Chapter", "szZ4aF4SFaQ", 1204, 1),
        (eng_ch1, "A Letter to God - Explanation", "NWgdJTLXBhk", 934, 2),
        (eng_ch2, "Nelson Mandela - Long Walk to Freedom", "tVjQFQ2e7N4", 1456, 1),
        (eng_ch2, "Nelson Mandela - Summary", "7HXGmOzpFqM", 876, 2),
        (eng_ch3, "Two Stories About Flying - Part 1", "dQw4w9WgXcQ", 1123, 1),
        (eng_ch3, "Two Stories About Flying - Part 2", "9bZkp7q19f0", 987, 2),
    ]
    for ch, title, yt_id, duration, seq in videos_data:
        db.add(Video(topic_id=topic_map[ch.id].id, title=title, youtube_id=yt_id, duration_seconds=duration, sequence=seq))

    await db.commit()

    if user_id:
        await seed_progress_for_user(db, user_id)

    return {"created": "demo data seeded successfully", "chapters": 6, "videos": 12}


async def seed_progress_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Create in-progress VideoProgress records for the first 4 active videos (idempotent)."""

    result = await db.execute(
        select(Video).where(Video.is_active == True).limit(4)  # noqa: E712
    )
    videos = result.scalars().all()
    if not videos:
        return

    # 30 / 45 / 60 / 50 percent completion for the 4 demo videos
    pcts = [30, 45, 60, 50]
    now = datetime.now(timezone.utc)

    for i, video in enumerate(videos):
        # Skip if progress already exists
        existing_prog = (
            await db.execute(
                select(VideoProgress).where(
                    VideoProgress.user_id == user_id,
                    VideoProgress.video_id == video.id,
                )
            )
        ).scalar_one_or_none()
        if existing_prog:
            continue

        pct = pcts[i % len(pcts)]
        watched = int((pct / 100) * (video.duration_seconds or 300))
        db.add(
            VideoProgress(
                user_id=user_id,
                video_id=video.id,
                watched_seconds=watched,
                is_completed=False,
                completion_percentage=float(pct),
                status="in_progress",
                last_position_seconds=watched,
                paused_at=now,
                resumed_at=None,
            )
        )

    await db.commit()


async def seed_unlock_for_testing(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """
    Mark video-progress records as completed for a test user to simulate the unlock flow.

    Unlock pattern:
      • Real Numbers  — ALL question-linked videos complete
                        → every exercise quiz + chapter quiz + PYP unlocked
      • Polynomials   — FIRST exercise videos complete
                        → exercise-1 quiz unlocked; chapter quiz still locked
      • Everything else — untouched (locked state preserved for testing)
    """

    now = datetime.now(timezone.utc)

    # ── Validate: exercise demo must exist ───────────────────────────────────
    board = (await db.execute(
        select(ContentBoard).where(ContentBoard.code == "CBSE")
    )).scalar_one_or_none()
    if not board:
        return {"error": "Run /seed-demo first"}

    any_exercise = (await db.execute(
        select(Exercise).limit(1)
    )).scalar_one_or_none()
    if not any_exercise:
        return {"error": "Run /seed-exercises first"}

    # ── Helper: mark a list of videos completed for user ────────────────────
    async def _mark_videos_complete(videos: list) -> int:
        count = 0
        for video in videos:
            existing = (await db.execute(
                select(VideoProgress).where(
                    VideoProgress.user_id == user_id,
                    VideoProgress.video_id == video.id,
                )
            )).scalar_one_or_none()

            if existing:
                existing.is_completed = True
                existing.completion_percentage = 100.0
                existing.status = "completed"
                existing.watched_seconds = video.duration_seconds or 300
                existing.last_position_seconds = video.duration_seconds or 300
            else:
                db.add(VideoProgress(
                    user_id=user_id,
                    video_id=video.id,
                    watched_seconds=video.duration_seconds or 300,
                    is_completed=True,
                    completion_percentage=100.0,
                    status="completed",
                    last_position_seconds=video.duration_seconds or 300,
                    paused_at=None,
                    resumed_at=now,
                ))
            count += 1
        return count

    total_unlocked = 0
    chapter_summary = {}

    # ── 1. Real Numbers — unlock ALL question-linked videos ──────────────────
    real_numbers = (await db.execute(
        select(Chapter)
        .join(Subject, Chapter.subject_id == Subject.id)
        .where(Chapter.title == "Real Numbers", Chapter.is_active == True)  # noqa: E712
        .limit(1)
    )).scalar_one_or_none()

    if real_numbers:
        rn_videos = (await db.execute(
            select(Video)
            .join(Question, Video.question_id == Question.id)
            .where(Question.chapter_id == real_numbers.id, Video.is_active == True)  # noqa: E712
        )).scalars().all()

        n = await _mark_videos_complete(rn_videos)
        total_unlocked += n

        # Also upsert UserLearningProgress for each exercise in Real Numbers
        exercises_rn = (await db.execute(
            select(Exercise).where(Exercise.chapter_id == real_numbers.id, Exercise.is_active == True)  # noqa: E712
        )).scalars().all()
        for ex in exercises_rn:
            ulp = (await db.execute(
                select(UserLearningProgress).where(
                    UserLearningProgress.user_id == user_id,
                    UserLearningProgress.entity_type == "exercise",
                    UserLearningProgress.entity_id == ex.id,
                )
            )).scalar_one_or_none()
            if ulp:
                ulp.status = "completed"
                ulp.completed_at = now
            else:
                db.add(UserLearningProgress(
                    user_id=user_id, entity_type="exercise", entity_id=ex.id,
                    status="completed", score=100.0, completed_at=now,
                ))

        chapter_summary["Real Numbers"] = f"{n} videos completed → chapter quiz + all exercise quizzes + papers unlocked"

    # ── 2. Polynomials — unlock first exercise only ──────────────────────────
    polynomials = (await db.execute(
        select(Chapter)
        .join(Subject, Chapter.subject_id == Subject.id)
        .where(Chapter.title == "Polynomials", Chapter.is_active == True)  # noqa: E712
        .limit(1)
    )).scalar_one_or_none()

    if polynomials:
        first_ex = (await db.execute(
            select(Exercise)
            .where(Exercise.chapter_id == polynomials.id, Exercise.is_active == True)  # noqa: E712
            .order_by(Exercise.sequence)
            .limit(1)
        )).scalar_one_or_none()

        if first_ex:
            poly_videos = (await db.execute(
                select(Video)
                .join(Question, Video.question_id == Question.id)
                .where(Question.exercise_id == first_ex.id, Video.is_active == True)  # noqa: E712
            )).scalars().all()

            n = await _mark_videos_complete(poly_videos)
            total_unlocked += n
            chapter_summary["Polynomials"] = f"{n} videos completed in '{first_ex.name}' → exercise quiz unlocked, chapter quiz still locked"

    await db.commit()

    return {
        "user_id": str(user_id),
        "videos_marked_complete": total_unlocked,
        "chapters": chapter_summary,
        "note": "Refresh the app — quiz cards will now show unlocked state",
    }


async def seed_exercise_demo(db: AsyncSession) -> dict:
    """Seed exercise→question→video→practice hierarchy for CBSE Math chapters."""
    # Check if already seeded
    existing_ex = (await db.execute(
        select(Exercise).limit(1)
    )).scalar_one_or_none()
    if existing_ex is not None:
        return {"already_seeded": True, "message": "Exercise demo data already exists"}

    # Find CBSE Math chapters (created by seed_demo_data)
    board = (await db.execute(select(ContentBoard).where(ContentBoard.code == "CBSE"))).scalar_one_or_none()
    if not board:
        return {"error": "Run /seed-demo first to create the CBSE board"}

    cls = (await db.execute(
        select(ContentClass).where(ContentClass.board_id == board.id, ContentClass.number == 10)
    )).scalar_one_or_none()
    if not cls:
        return {"error": "Class 10 not found. Run /seed-demo first."}

    math = (await db.execute(
        select(Subject).where(Subject.class_id == cls.id, Subject.code == "MATH")
    )).scalar_one_or_none()
    if not math:
        return {"error": "Mathematics subject not found. Run /seed-demo first."}

    chapters = (await db.execute(
        select(Chapter).where(Chapter.subject_id == math.id).order_by(Chapter.sequence)
    )).scalars().all()
    ch_map = {ch.title: ch for ch in chapters}

    counts = {"exercises": 0, "questions": 0, "videos": 0, "practice_questions": 0}

    # ── Chapter 1: Real Numbers ───────────────────────────────────────────────
    ch1 = ch_map.get("Real Numbers")
    if ch1:
        ex11 = Exercise(chapter_id=ch1.id, name="Exercise 1.1 – Euclid's Division Algorithm", number="1.1", sequence=1)
        ex12 = Exercise(chapter_id=ch1.id, name="Exercise 1.2 – Fundamental Theorem of Arithmetic", number="1.2", sequence=2)
        db.add(ex11); db.add(ex12)
        await db.flush()
        counts["exercises"] += 2

        # Exercise 1.1 — Q1
        q1 = Question(chapter_id=ch1.id, exercise_id=ex11.id, question_number="1",
                      question_text="Use Euclid's division algorithm to find the HCF of 135 and 225.", sequence=1)
        db.add(q1); await db.flush()
        counts["questions"] += 1
        db.add(Video(question_id=q1.id, title="HCF using Euclid's Division Lemma",
                     youtube_id="uTwnZSiTgGE", youtube_id_hi="AuX7nPBqDts", duration_seconds=845))
        counts["videos"] += 1
        db.add(PracticeQuestion(question_id=q1.id, text="What is the HCF of 135 and 225?",
                                option_a="15", option_b="25", option_c="30", option_d="45",
                                correct_option="d", explanation="225 = 1×135 + 90; 135 = 1×90 + 45; 90 = 2×45. HCF = 45.",
                                difficulty="easy", sequence=1))
        db.add(PracticeQuestion(question_id=q1.id, text="What is the HCF of 867 and 255?",
                                option_a="17", option_b="51", option_c="85", option_d="3",
                                correct_option="b", explanation="867 = 3×255 + 102; 255 = 2×102 + 51; 102 = 2×51. HCF = 51.",
                                difficulty="medium", sequence=2))
        counts["practice_questions"] += 2

        # Exercise 1.1 — Q2
        q2 = Question(chapter_id=ch1.id, exercise_id=ex11.id, question_number="2",
                      question_text="Show that any positive odd integer is of the form 6q+1, 6q+3, or 6q+5.", sequence=2)
        db.add(q2); await db.flush()
        counts["questions"] += 1
        db.add(Video(question_id=q2.id, title="Odd Integer Number Forms – Proof",
                     youtube_id="AuX7nPBqDts", duration_seconds=712))
        counts["videos"] += 1
        db.add(PracticeQuestion(question_id=q2.id, text="Any odd integer can be written in the form:",
                                option_a="2q + 1", option_b="2q", option_c="4q + 1", option_d="6q + 2",
                                correct_option="a", explanation="By definition, odd integers are not divisible by 2, so they have the form 2q+1.",
                                difficulty="easy", sequence=1))
        counts["practice_questions"] += 1

        # Exercise 1.2 — Q1
        q3 = Question(chapter_id=ch1.id, exercise_id=ex12.id, question_number="1",
                      question_text="Express 140 as a product of its prime factors.", sequence=1)
        db.add(q3); await db.flush()
        counts["questions"] += 1
        db.add(Video(question_id=q3.id, title="Prime Factorization Method",
                     youtube_id="e0NWAHIkFHE", youtube_id_hi="4RAjCH7WBKY", duration_seconds=632))
        counts["videos"] += 1
        db.add(PracticeQuestion(question_id=q3.id, text="Prime factorization of 140 is:",
                                option_a="2 × 5 × 7", option_b="2² × 5 × 7", option_c="2 × 5² × 7", option_d="2³ × 5 × 7",
                                correct_option="b", explanation="140 = 2×70 = 2×2×35 = 2×2×5×7 = 2²×5×7.",
                                difficulty="easy", sequence=1))
        db.add(PracticeQuestion(question_id=q3.id, text="Which of the following is NOT a prime number?",
                                option_a="2", option_b="7", option_c="11", option_d="1",
                                correct_option="d", explanation="1 is neither prime nor composite by definition.",
                                difficulty="easy", sequence=2))
        counts["practice_questions"] += 2

        # Exercise 1.2 — Q2
        q4 = Question(chapter_id=ch1.id, exercise_id=ex12.id, question_number="2",
                      question_text="Find LCM and HCF of 12 and 18 using prime factorization.", sequence=2)
        db.add(q4); await db.flush()
        counts["questions"] += 1
        db.add(PracticeQuestion(question_id=q4.id, text="LCM of 12 and 18 is:",
                                option_a="6", option_b="36", option_c="72", option_d="216",
                                correct_option="b", explanation="LCM(12,18) = 2²×3² = 36.",
                                difficulty="medium", sequence=1))
        counts["practice_questions"] += 1

    # ── Chapter 2: Polynomials ────────────────────────────────────────────────
    ch2 = ch_map.get("Polynomials")
    if ch2:
        ex21 = Exercise(chapter_id=ch2.id, name="Exercise 2.1 – Zeroes of Polynomials", number="2.1", sequence=1)
        ex22 = Exercise(chapter_id=ch2.id, name="Exercise 2.2 – Relationship Between Zeroes and Coefficients", number="2.2", sequence=2)
        db.add(ex21); db.add(ex22)
        await db.flush()
        counts["exercises"] += 2

        q5 = Question(chapter_id=ch2.id, exercise_id=ex21.id, question_number="1",
                      question_text="Find the zeroes of the quadratic polynomial p(x) = x² − 4.", sequence=1)
        db.add(q5); await db.flush()
        counts["questions"] += 1
        db.add(Video(question_id=q5.id, title="Finding Zeroes of a Quadratic Polynomial",
                     youtube_id="4RAjCH7WBKY", youtube_id_hi="e0NWAHIkFHE", duration_seconds=754))
        counts["videos"] += 1
        db.add(PracticeQuestion(question_id=q5.id, text="The zeroes of x² − 4 are:",
                                option_a="±1", option_b="±3", option_c="±2", option_d="0 and 4",
                                correct_option="c", explanation="x²−4=0 ⟹ x²=4 ⟹ x=±2.",
                                difficulty="easy", sequence=1))
        db.add(PracticeQuestion(question_id=q5.id, text="How many zeroes can a quadratic polynomial have?",
                                option_a="1", option_b="At most 2", option_c="Exactly 2", option_d="3",
                                correct_option="b", explanation="A degree-n polynomial has at most n real zeroes.",
                                difficulty="easy", sequence=2))
        counts["practice_questions"] += 2

        q6 = Question(chapter_id=ch2.id, exercise_id=ex22.id, question_number="1",
                      question_text="If α and β are zeroes of x² − 5x + 6, find α+β and αβ.", sequence=1)
        db.add(q6); await db.flush()
        counts["questions"] += 1
        db.add(Video(question_id=q6.id, title="Sum and Product of Zeroes",
                     youtube_id="IWigSB_zOeY", duration_seconds=913))
        counts["videos"] += 1
        db.add(PracticeQuestion(question_id=q6.id, text="For x² − 5x + 6, the sum of zeroes (α+β) is:",
                                option_a="5", option_b="−5", option_c="6", option_d="−6",
                                correct_option="a", explanation="α+β = −b/a = −(−5)/1 = 5.",
                                difficulty="easy", sequence=1))
        db.add(PracticeQuestion(question_id=q6.id, text="For x² − 5x + 6, the product of zeroes (αβ) is:",
                                option_a="5", option_b="−5", option_c="−6", option_d="6",
                                correct_option="d", explanation="αβ = c/a = 6/1 = 6.",
                                difficulty="easy", sequence=2))
        counts["practice_questions"] += 2

    # ── Chapter 3: Quadratic Equations ────────────────────────────────────────
    ch3 = ch_map.get("Quadratic Equations")
    if ch3:
        ex31 = Exercise(chapter_id=ch3.id, name="Exercise 3.1 – Solving by Factorisation", number="3.1", sequence=1)
        db.add(ex31)
        await db.flush()
        counts["exercises"] += 1

        q7 = Question(chapter_id=ch3.id, exercise_id=ex31.id, question_number="1",
                      question_text="Solve: x² − 5x + 6 = 0 by factorisation.", sequence=1)
        db.add(q7); await db.flush()
        counts["questions"] += 1
        db.add(Video(question_id=q7.id, title="Solving Quadratic Equations by Factorisation",
                     youtube_id="2ZzuZvz33X0", youtube_id_hi="IWigSB_zOeY", duration_seconds=687))
        counts["videos"] += 1
        db.add(PracticeQuestion(question_id=q7.id, text="The roots of x² − 5x + 6 = 0 are:",
                                option_a="1 and 6", option_b="2 and 3", option_c="−2 and −3", option_d="1 and 5",
                                correct_option="b", explanation="x²−5x+6 = (x−2)(x−3) = 0 ⟹ x=2 or x=3.",
                                difficulty="easy", sequence=1))
        db.add(PracticeQuestion(question_id=q7.id, text="ax²+bx+c=0 is a quadratic equation when:",
                                option_a="a=0", option_b="a≠0", option_c="b=0", option_d="c=0",
                                correct_option="b", explanation="The coefficient of x² must be non-zero for it to be quadratic.",
                                difficulty="easy", sequence=2))
        counts["practice_questions"] += 2

        q8 = Question(chapter_id=ch3.id, exercise_id=ex31.id, question_number="2",
                      question_text="Solve: 2x² + 7x + 3 = 0 by factorisation.", sequence=2)
        db.add(q8); await db.flush()
        counts["questions"] += 1
        db.add(PracticeQuestion(question_id=q8.id, text="Roots of 2x² + 7x + 3 = 0 are:",
                                option_a="−3 and −½", option_b="3 and ½", option_c="−3 and ½", option_d="3 and −½",
                                correct_option="a", explanation="2x²+7x+3 = (2x+1)(x+3) = 0 ⟹ x=−½ or x=−3.",
                                difficulty="medium", sequence=1))
        counts["practice_questions"] += 1

    await db.commit()
    return {
        "seeded": True,
        "exercises": counts["exercises"],
        "questions": counts["questions"],
        "videos": counts["videos"],
        "practice_questions": counts["practice_questions"],
    }


# ── Note bookmarks ────────────────────────────────────────────────────────────


async def seed_demo_catalog(db: AsyncSession) -> dict:
    """Seed comprehensive demo data: boards, classes, subjects, chapters, topics, videos, PYPs, knowledge articles."""
    # ── 1. Boards ─────────────────────────────────────────────────────────────
    boards_data = [
        {"name": "CBSE", "code": "cbse"},
        {"name": "ICSE", "code": "icse"},
        {"name": "HBSE", "code": "hbse"},
    ]
    boards = {}
    for b in boards_data:
        existing = (await db.execute(select(ContentBoard).where(ContentBoard.code == b["code"]))).scalar_one_or_none()
        if not existing:
            obj = ContentBoard(**b)
            db.add(obj)
            await db.flush()
            boards[b["code"]] = obj.id
        else:
            boards[b["code"]] = existing.id

    # ── 2. Classes (6–12 for CBSE) ─────────────────────────────────────────
    classes_data = [{"number": n, "name": f"Class {n}"} for n in range(6, 13)]
    classes = {}
    for board_code, board_id in boards.items():
        for c in classes_data:
            key = f"{board_code}_{c['number']}"
            existing = (await db.execute(
                select(ContentClass).where(ContentClass.board_id == board_id, ContentClass.number == c["number"])
            )).scalar_one_or_none()
            if not existing:
                obj = ContentClass(board_id=board_id, **c)
                db.add(obj)
                await db.flush()
                classes[key] = obj.id
            else:
                classes[key] = existing.id

    # ── 3. Subjects for Class 10 CBSE ──────────────────────────────────────
    subjects_seed = [
        {"name": "Mathematics", "code": "math"},
        {"name": "Science", "code": "sci"},
        {"name": "Social Science", "code": "sst"},
        {"name": "English", "code": "eng"},
        {"name": "Hindi", "code": "hindi"},
    ]
    subjects = {}
    class10_cbse_id = classes.get("cbse_10")
    if class10_cbse_id:
        for s in subjects_seed:
            key = f"cbse_10_{s['code']}"
            existing = (await db.execute(
                select(Subject).where(Subject.class_id == class10_cbse_id, Subject.code == s["code"])
            )).scalar_one_or_none()
            if not existing:
                obj = Subject(class_id=class10_cbse_id, **s)
                db.add(obj)
                await db.flush()
                subjects[key] = obj.id
            else:
                subjects[key] = existing.id

    # ── 4. Chapters for Science ─────────────────────────────────────────────
    sci_id = subjects.get("cbse_10_sci")
    chapters_seed = [
        {"title": "Light - Reflection and Refraction", "description": "Laws of reflection, spherical mirrors, refraction, lenses", "sequence": 1},
        {"title": "Human Eye and Colourful World", "description": "Structure of eye, defects, atmospheric refraction, dispersion", "sequence": 2},
        {"title": "Electricity", "description": "Electric circuit, Ohm's law, resistance, power", "sequence": 3},
        {"title": "Magnetic Effects of Electric Current", "description": "Magnetic field, electromagnet, motor, generator", "sequence": 4},
        {"title": "Chemical Reactions and Equations", "description": "Types of chemical reactions, balancing equations", "sequence": 5},
        {"title": "Acids, Bases and Salts", "description": "Properties, pH scale, important compounds", "sequence": 6},
        {"title": "Life Processes", "description": "Nutrition, respiration, transportation, excretion", "sequence": 7},
        {"title": "Control and Coordination", "description": "Nervous system, hormones, plant movements", "sequence": 8},
    ]
    chapters = {}
    if sci_id:
        for c in chapters_seed:
            key = f"sci_{c['sequence']}"
            existing = (await db.execute(
                select(Chapter).where(Chapter.subject_id == sci_id, Chapter.sequence == c["sequence"])
            )).scalar_one_or_none()
            if not existing:
                obj = Chapter(subject_id=sci_id, **c)
                db.add(obj)
                await db.flush()
                chapters[key] = obj.id
            else:
                chapters[key] = existing.id

    # ── 5. Topics and Videos for Light chapter ──────────────────────────────
    light_id = chapters.get("sci_1")
    topics_seed = [
        {"title": "Laws of Reflection", "sequence": 1, "difficulty": "easy"},
        {"title": "Spherical Mirrors", "sequence": 2, "difficulty": "medium"},
        {"title": "Refraction of Light", "sequence": 3, "difficulty": "medium"},
        {"title": "Lenses and Image Formation", "sequence": 4, "difficulty": "hard"},
    ]
    if light_id:
        for t in topics_seed:
            existing_topic = (await db.execute(
                select(Topic).where(Topic.chapter_id == light_id, Topic.sequence == t["sequence"])
            )).scalar_one_or_none()
            if not existing_topic:
                diff_map = {"easy": DifficultyLevel.EASY, "medium": DifficultyLevel.MEDIUM, "hard": DifficultyLevel.HARD}
                topic_obj = Topic(
                    chapter_id=light_id,
                    title=t["title"],
                    sequence=t["sequence"],
                    difficulty=diff_map[t["difficulty"]],
                )
                db.add(topic_obj)
                await db.flush()
                # Add a demo video for each topic
                video_data = [
                    ("Laws of Reflection - Full Explanation", "dQw4w9WgXcQ", 720),
                    ("Spherical Mirrors - Concave vs Convex", "vTED9T5s6Hs", 540),
                    ("Refraction of Light - CBSE Class 10", "sKpQmRhHQ94", 810),
                    ("Lenses - Convex and Concave", "WKhgGNkIuIg", 630),
                ]
                vd = video_data[t["sequence"] - 1]
                vid = Video(
                    topic_id=topic_obj.id,
                    title=vd[0], youtube_id=vd[1], duration_seconds=vd[2], sequence=1, is_active=True
                )
                db.add(vid)

    # ── 6. Previous Year Papers ─────────────────────────────────────────────
    pyp_data = [
        {
            "board": "CBSE", "class_num": 10, "subject": "Science", "year": 2025,
            "exam_type": "board_exam", "title": "CBSE Class 10 Science Board Exam 2025",
            "description": "Official CBSE board examination for Class 10 Science (Theory). 80 marks, 3 hours.",
            "difficulty": "medium", "file_url": None,
            "tags": {"topics": ["Light", "Electricity", "Chemical Reactions", "Life Processes"]},
            "videos": [
                {"youtube_id": "dQw4w9WgXcQ", "title": "CBSE 2025 Science Paper Solution", "duration_seconds": 2400, "topic": "Full Paper"},
                {"youtube_id": "vTED9T5s6Hs", "title": "Section A MCQs Explained", "duration_seconds": 1200, "topic": "MCQs"},
            ],
        },
        {
            "board": "CBSE", "class_num": 10, "subject": "Science", "year": 2024,
            "exam_type": "board_exam", "title": "CBSE Class 10 Science Board Exam 2024",
            "description": "CBSE 2024 board examination. 80 marks, 3 hours.",
            "difficulty": "medium", "file_url": None,
            "tags": {"topics": ["Light", "Electricity", "Acids & Bases", "Heredity"]},
            "videos": [
                {"youtube_id": "sKpQmRhHQ94", "title": "CBSE 2024 Science Full Solution", "duration_seconds": 2700, "topic": "Full Paper"},
            ],
        },
        {
            "board": "CBSE", "class_num": 10, "subject": "Mathematics", "year": 2025,
            "exam_type": "board_exam", "title": "CBSE Class 10 Mathematics Board Exam 2025",
            "description": "CBSE Maths board exam 2025. Standard paper, 80 marks.",
            "difficulty": "hard", "file_url": None,
            "tags": {"topics": ["Algebra", "Geometry", "Trigonometry", "Statistics"]},
            "videos": [
                {"youtube_id": "WKhgGNkIuIg", "title": "CBSE 2025 Maths Complete Solution", "duration_seconds": 3600, "topic": "Full Solution"},
            ],
        },
        {
            "board": "CBSE", "class_num": 12, "subject": "Physics", "year": 2025,
            "exam_type": "board_exam", "title": "CBSE Class 12 Physics Board Exam 2025",
            "description": "CBSE 2025 Class 12 Physics. 70 marks theory + 30 marks practical.",
            "difficulty": "hard", "file_url": None,
            "tags": {"topics": ["Electrostatics", "Current Electricity", "Optics", "Modern Physics"]},
            "videos": [],
        },
        {
            "board": "CBSE", "class_num": 10, "subject": "Science", "year": 2025,
            "exam_type": "sample", "title": "CBSE Sample Paper Science 2025",
            "description": "CBSE official sample paper for practice before board exams.",
            "difficulty": "medium", "file_url": None,
            "tags": {"topics": ["All Chapters"]},
            "videos": [],
        },
        {
            "board": "ICSE", "class_num": 10, "subject": "Physics", "year": 2025,
            "exam_type": "board_exam", "title": "ICSE Class 10 Physics Paper 2025",
            "description": "ICSE board exam 2025. Paper 1 theory.",
            "difficulty": "medium", "file_url": None,
            "tags": {"topics": ["Force", "Work", "Light", "Sound"]},
            "videos": [],
        },
    ]
    for p in pyp_data:
        existing = (await db.execute(
            select(PreviousYearPaper).where(
                PreviousYearPaper.board == p["board"],
                PreviousYearPaper.class_num == p["class_num"],
                PreviousYearPaper.subject == p["subject"],
                PreviousYearPaper.year == p["year"],
                PreviousYearPaper.exam_type == p["exam_type"],
            )
        )).scalar_one_or_none()
        if not existing:
            db.add(PreviousYearPaper(**p))

    # ── 7. Knowledge Hub categories and articles ────────────────────────────
    cat_data = [
        {"name": "AI & Technology", "icon": "🤖", "color": "from-violet-400 to-purple-600", "sequence": 1},
        {"name": "Science & Nature", "icon": "🔬", "color": "from-green-400 to-teal-600", "sequence": 2},
        {"name": "Career & Skills", "icon": "🎯", "color": "from-blue-400 to-cyan-600", "sequence": 3},
        {"name": "Finance & Economy", "icon": "💰", "color": "from-yellow-400 to-orange-500", "sequence": 4},
        {"name": "Current Affairs", "icon": "🌐", "color": "from-red-400 to-pink-600", "sequence": 5},
        {"name": "Life Skills", "icon": "🌱", "color": "from-emerald-400 to-green-600", "sequence": 6},
    ]
    cats = {}
    for c in cat_data:
        existing = (await db.execute(
            select(KnowledgeCategory).where(KnowledgeCategory.name == c["name"])
        )).scalar_one_or_none()
        if not existing:
            obj = KnowledgeCategory(**c)
            db.add(obj)
            await db.flush()
            cats[c["name"]] = obj.id
        else:
            cats[c["name"]] = existing.id

    articles_data = [
        {
            "cat": "AI & Technology",
            "title": "How AI is Transforming Education in India",
            "description": "AI-powered tools are revolutionizing how Indian students learn — from personalized quizzes to instant doubt solving.",
            "content": "Artificial Intelligence is no longer science fiction...",
            "duration_min": 6, "is_trending": True, "author": "EduLearn Team",
        },
        {
            "cat": "AI & Technology",
            "title": "What is Machine Learning? A Simple Guide for Students",
            "description": "Machine learning explained in plain English — no maths degree required.",
            "content": "Machine learning is a subset of AI...",
            "duration_min": 8, "is_trending": False, "author": "Tech Desk",
        },
        {
            "cat": "AI & Technology",
            "title": "Top 5 AI Tools Every Student Should Know in 2025",
            "description": "From AI writing assistants to coding helpers — these tools can supercharge your studies.",
            "content": "The AI revolution is here...",
            "duration_min": 5, "is_trending": True, "author": "EduLearn Team",
        },
        {
            "cat": "Science & Nature",
            "title": "Why the Sky Is Blue — The Science Behind It",
            "description": "Rayleigh scattering explained in a way that will stick with you forever.",
            "content": "Have you ever wondered why the sky is blue?",
            "duration_min": 4, "is_trending": False, "author": "Science Desk",
        },
        {
            "cat": "Science & Nature",
            "title": "Climate Change: What Every Student Needs to Know",
            "description": "The science of global warming, its causes, effects, and what you can do.",
            "content": "Climate change is the defining challenge of our generation...",
            "duration_min": 10, "is_trending": True, "author": "Environment Team",
        },
        {
            "cat": "Career & Skills",
            "title": "How to Choose the Right Stream After Class 10",
            "description": "Science, Commerce, or Arts? A clear guide to help you decide based on your interests.",
            "content": "Class 10 board results bring one of the biggest decisions...",
            "duration_min": 7, "is_trending": True, "author": "Career Counsellor",
        },
        {
            "cat": "Career & Skills",
            "title": "10 High-Demand Careers in India for 2025 and Beyond",
            "description": "Data Science, Renewable Energy, Healthcare AI — the jobs of the future are already here.",
            "content": "The Indian job market is transforming rapidly...",
            "duration_min": 8, "is_trending": False, "author": "Career Desk",
        },
        {
            "cat": "Career & Skills",
            "title": "How to Write a Resume That Gets You Noticed",
            "description": "Step-by-step guide to writing a compelling resume — even if you have no experience.",
            "content": "Your resume is your first impression...",
            "duration_min": 6, "is_trending": False, "author": "Career Team",
        },
        {
            "cat": "Finance & Economy",
            "title": "Budget 2025: What It Means for Students",
            "description": "Breaking down the Union Budget 2025 — education spending, scholarships, and what's in it for you.",
            "content": "The Union Budget 2025 was presented by...",
            "duration_min": 5, "is_trending": True, "author": "Finance Desk",
        },
        {
            "cat": "Finance & Economy",
            "title": "How to Start Investing as a Student",
            "description": "SIP, mutual funds, and savings — a beginner's guide to financial literacy for young Indians.",
            "content": "Money doesn't grow on trees, but it can grow in mutual funds...",
            "duration_min": 9, "is_trending": False, "author": "Finance Team",
        },
        {
            "cat": "Current Affairs",
            "title": "ISRO's Latest Missions Explained",
            "description": "Everything about Chandrayaan-4, Gaganyaan, and India's space ambitions in 2025.",
            "content": "India's space program has come a long way...",
            "duration_min": 7, "is_trending": True, "author": "Science Reporter",
        },
        {
            "cat": "Current Affairs",
            "title": "G20 Summit 2024: Key Outcomes You Should Know",
            "description": "Climate, AI governance, global debt relief — what was decided and why it matters to India.",
            "content": "The G20 Summit held in...",
            "duration_min": 6, "is_trending": False, "author": "International Desk",
        },
        {
            "cat": "Life Skills",
            "title": "How to Study Smarter, Not Harder — Science-Backed Tips",
            "description": "Spaced repetition, active recall, the Pomodoro technique — methods proven to work.",
            "content": "Most students study the wrong way...",
            "duration_min": 8, "is_trending": True, "author": "Education Research Team",
        },
        {
            "cat": "Life Skills",
            "title": "Managing Exam Stress: Practical Tips That Actually Work",
            "description": "Breathing exercises, sleep hygiene, time management — handle exam pressure like a pro.",
            "content": "Exam stress is real, but it is manageable...",
            "duration_min": 5, "is_trending": False, "author": "Wellness Team",
        },
        {
            "cat": "Life Skills",
            "title": "The Power of Reading: Why Books Make You Smarter",
            "description": "Science says reading fiction, non-fiction, and newspapers improves your brain in measurable ways.",
            "content": "In an age of short videos and reels...",
            "duration_min": 5, "is_trending": False, "author": "EduLearn Team",
        },
    ]
    for a in articles_data:
        cat_id = cats.get(a["cat"])
        if not cat_id:
            continue
        # scalar_one_or_none() raises MultipleResultsFound if a title was ever
        # duplicated (e.g. an admin created an article whose title happens to
        # match a seed row) — take the first match instead so re-running the
        # seed stays the advertised "safe, skips existing records" operation.
        existing = (await db.execute(
            select(KnowledgeArticle).where(KnowledgeArticle.title == a["title"])
        )).scalars().first()
        if not existing:
            db.add(KnowledgeArticle(
                category_id=cat_id,
                title=a["title"],
                description=a["description"],
                content=a["content"],
                duration_min=a["duration_min"],
                is_trending=a["is_trending"],
                author=a.get("author"),
                view_count=0,
                is_published=True,
            ))

    await db.commit()
    return {"message": "Demo data seeded successfully", "boards": len(boards_data), "pyp_papers": len(pyp_data), "knowledge_articles": len(articles_data)}


# ── User Learning Progress ────────────────────────────────────────────────────
