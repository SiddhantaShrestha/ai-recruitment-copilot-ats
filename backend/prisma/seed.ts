import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.recruiter.findUnique({
    where: { email: "test@example.com" },
  });
  if (existing) {
    console.log("Test recruiter already exists, skipping seed.");
    return;
  }

  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.recruiter.create({
    data: {
      fullName: "Test Recruiter",
      email: "test@example.com",
      passwordHash,
      role: "RECRUITER",
    },
  });
  console.log("Created test recruiter: test@example.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
