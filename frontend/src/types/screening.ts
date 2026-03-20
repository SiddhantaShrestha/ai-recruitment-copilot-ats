export type ScreeningQuestionType = "TEXT" | "YES_NO" | "NUMBER";

export type ScreeningQuestion = {
  id: string;
  jobId: string;
  question: string;
  order: number;
  type: ScreeningQuestionType;
};

export type ScreeningAnswerDraft = {
  screeningQuestionId: string;
  answer: string;
};

export type ScreeningQuestionDraft = {
  question: string;
  order: number;
  type: ScreeningQuestionType;
};

