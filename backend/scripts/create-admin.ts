import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function randomChar(charset: string): string {
  const idx = crypto.randomBytes(1)[0] % charset.length;
  return charset[idx];
}

function generatePassword(length = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*()-_=+";
  const all = upper + lower + digits + symbols;

  const required = [randomChar(upper), randomChar(lower), randomChar(digits), randomChar(symbols)];
  const rest = Array.from({ length: length - required.length }, () => randomChar(all));
  const chars = [...required, ...rest];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

async function main() {
  const email = "gustavo.oliveira@alltak.com.br";
  const name = "Gustavo Oliveira";
  const password = generatePassword(16);
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "SUPERVISOR", active: true },
    create: { name, email, passwordHash, role: "SUPERVISOR" },
  });

  const timestamp = new Date().toISOString();
  const fileContent = `email: ${email}\nsenha: ${password}\ngerado em: ${timestamp}\n\nAVISO: mover este arquivo para fora do repositorio e apagar apos o primeiro login.\n`;
  const filePath = path.join(__dirname, "..", "CREDENCIAL-ADMIN.local.txt");
  fs.writeFileSync(filePath, fileContent, { encoding: "utf-8" });

  console.log(`Usuario SUPERVISOR criado/atualizado: ${email} (role=SUPERVISOR)`);
  console.log(`Senha gerada (exibida apenas agora): ${password}`);
  console.log(`Tambem gravada em: ${filePath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
