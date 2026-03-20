import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import type { RecruiterAuth } from "../types/auth.types";

const JWT_SECRET = env.JWT_SECRET;

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  (async () => {
    const authHeader = req.headers.authorization;
    const token =
      authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    if (!token) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { sub: string };
      const recruiter = await prisma.recruiter.findUnique({
        where: { id: decoded.sub },
        select: { id: true, fullName: true, email: true },
      });

      if (!recruiter) {
        res.status(401).json({ success: false, message: "User not found" });
        return;
      }

      req.user = {
        id: recruiter.id,
        fullName: recruiter.fullName,
        email: recruiter.email,
      } as RecruiterAuth;
      next();
    } catch {
      if (!res.headersSent) {
        res.status(401).json({ success: false, message: "Invalid or expired token" });
      } else {
        next();
      }
    }
  })();
}
