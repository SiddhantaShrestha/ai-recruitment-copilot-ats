import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRES_IN = "7d";

type LoginBody = { email?: string; password?: string };

export async function login(
  req: Request<{}, {}, LoginBody>,
  res: Response
): Promise<void> {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || !email.trim()) {
      res.status(400).json({
        success: false,
        message: "email is required",
      });
      return;
    }
    if (typeof password !== "string" || !password) {
      res.status(400).json({
        success: false,
        message: "password is required",
      });
      return;
    }

    const recruiter = await prisma.recruiter.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (
      !recruiter ||
      !(await bcrypt.compare(password, recruiter.passwordHash))
    ) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    const token = jwt.sign(
      { sub: recruiter.id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: recruiter.id,
          fullName: recruiter.fullName,
          email: recruiter.email,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Not authenticated" });
    return;
  }
  res.status(200).json({
    success: true,
    data: req.user,
  });
}
