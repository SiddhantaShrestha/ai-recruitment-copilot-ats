import type { RecruiterAuth } from "./auth.types";

declare global {
  namespace Express {
    interface Request {
      user?: RecruiterAuth;
    }
  }
}

export {};
