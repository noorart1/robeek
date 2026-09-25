
const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// While muted, typed characters are not echoed (used for the password).
let muted = false;

rl._writeToOutput = (text) => {
  if (!muted) rl.output.write(text);
};

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function askHidden(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      muted = false;
      rl.output.write("\n");
      resolve(answer);
    });

    // The prompt has been written by now; mute only the keystrokes.
    muted = true;
  });
}

async function main() {
  const username = (await ask("Admin username: ")).trim();
  const fullName = (await ask("Full name: ")).trim();
  const password = await askHidden("Password: ");
  const confirmation = await askHidden("Repeat password: ");

  if (!username || !fullName || password.length < 12) {
    throw new Error(
      "Username and full name are required. Password must have at least 12 characters."
    );
  }

  if (password !== confirmation) {
    throw new Error("Passwords do not match.");
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
      isActive: true,
      updatedAt: new Date()
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
