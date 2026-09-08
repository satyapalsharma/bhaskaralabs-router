// Academics progress tracking — localStorage-only, by design.
//
// Account sync was considered and rejected for now: the only settings API is
// POST /api/settings/training (a single trainingOptOut boolean on the user
// row), and the DB schema is frozen, so there is nowhere to store per-quiz
// progress server-side without a migration. If a generic progress endpoint is
// added later, this module is the single seam: mirror recordQuizResult() to it.

const STORAGE_KEY = "bhaskara.academics.progress.v1";

export type QuizResult = {
  best: number;
  total: number;
  completedAt: string;
};

export type AcademicsProgress = {
  quizzes: Record<string, QuizResult>;
};

const EMPTY: AcademicsProgress = { quizzes: {} };

function readStore(): AcademicsProgress {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AcademicsProgress>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY;
    if (!parsed.quizzes || typeof parsed.quizzes !== "object") return EMPTY;
    return { quizzes: parsed.quizzes as AcademicsProgress["quizzes"] };
  } catch {
    return EMPTY;
  }
}

function writeStore(progress: AcademicsProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage full / private mode — progress just doesn't persist.
  }
}

export function loadProgress(): AcademicsProgress {
  return readStore();
}

// Records a finished quiz attempt. Keeps the best score per quiz id.
// Returns the updated progress snapshot.
export function recordQuizResult(
  quizId: string,
  score: number,
  total: number,
): AcademicsProgress {
  const progress = readStore();
  const prev = progress.quizzes[quizId];
  const next: AcademicsProgress = {
    quizzes: {
      ...progress.quizzes,
      [quizId]: {
        best: Math.max(prev?.best ?? 0, score),
        total,
        completedAt: new Date().toISOString(),
      },
    },
  };
  writeStore(next);
  return next;
}

export function getQuizBest(quizId: string): QuizResult | null {
  return readStore().quizzes[quizId] ?? null;
}

export function completedQuizCount(): number {
  return Object.keys(readStore().quizzes).length;
}

export function resetProgress(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
