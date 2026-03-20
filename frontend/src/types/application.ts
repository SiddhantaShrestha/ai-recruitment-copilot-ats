export type ApplicationStatus =
  | "APPLIED"
  | "SCREENED"
  | "SHORTLISTED"
  | "INTERVIEW"
  | "OFFER"
  | "HIRED"
  | "REJECTED";

export type AiRecommendation = "SHORTLIST" | "MAYBE" | "REJECT" | null;

export type ApplicationListItem = {
  id: string;
  candidateId?: string;
  jobId?: string;
  appliedAt?: string;
  updatedAt?: string;
  aiScore: number | null;
  aiSummary: string | null;
  aiRecommendation: AiRecommendation;
  status: ApplicationStatus;
  candidate: {
    fullName: string;
    email: string;
    phone: string | null;
    resumeUrl: string | null;
  };
  job: {
    title: string;
    department: string | null;
    location: string | null;
    description: string | null;
  };
  answers: Array<{
    id: string;
    applicationId: string;
    candidateId: string;
    screeningQuestionId: string;
    answer: string;
    createdAt: string;
    screeningQuestion: {
      id: string;
      jobId: string;
      question: string;
      order: number;
      createdAt: string;
    };
  }>;
};

