
const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function main() {
  const username = (await ask("Admin username: ")).trim();
  const fullName = (await ask("Full name: ")).trim();
  const password = await ask("Password: ");

  if (!username || !fullName || password.length < 12) {
    throw new Error(
      "Username and full name are required. Password must have at least 12 characters."
    );
  }

  const existing = await prisma.user.findUnique({
    where: { username }
  });

  if (existing) {
    throw new Error("This username already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      username,
      fullName,
      passwordHash,
      role: "ADMIN",
      isActive: true
    }
  });

  console.log("Admin account created successfully.");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
