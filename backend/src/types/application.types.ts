export interface CreateApplicationBody {
    fullName: string;
    email: string;
    phone?: string;
    resumeUrl?: string;
    jobId: string;
  }