import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

type ScreeningQuestionInput = {
  question?: string;
  order?: number;
  type?: "TEXT" | "YES_NO" | "NUMBER";
};

type CreateScreeningQuestionsBody = {
  questions?: ScreeningQuestionInput[];
};

export const createScreeningQuestions = async (
  req: Request<{ jobId: string }, {}, CreateScreeningQuestionsBody>,
  res: Response
) => {
  try {
    const { jobId } = req.params;
    const { questions } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "questions must be a non-empty array",
      });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    const normalizedQuestions = questions.map((q) => ({
      question: q.question,
      order: q.order,
      type: q.type ?? "TEXT",
    }));

    for (const q of normalizedQuestions) {
      if (
        !q.question ||
        typeof q.order !== "number" ||
        !Number.isInteger(q.order) ||
        (q.type !== "TEXT" && q.type !== "YES_NO" && q.type !== "NUMBER")
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Each question must include a non-empty question and an integer order",
        });
      }
    }

    const createdQuestions = await prisma.$transaction(async (tx) => {
      return Promise.all(
        normalizedQuestions.map((q) =>
          tx.screeningQuestion.create({
            data: {
              jobId,
              question: q.question as string,
              order: q.order as number,
              type: q.type,
            },
          })
        )
      );
    });

    return res.status(201).json({
      success: true,
      data: createdQuestions,
    });
  } catch (error) {
    console.error("Create screening questions error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getScreeningQuestions = async (
  req: Request<{ jobId: string }>,
  res: Response
) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    const questions = await prisma.screeningQuestion.findMany({
      where: { jobId },
      orderBy: { order: "asc" },
    });

    return res.status(200).json({
      success: true,
      data: questions,
    });
  } catch (error) {
    console.error("Get screening questions error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

