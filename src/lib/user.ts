import { prisma } from "./prisma";

const DEFAULT_EMAIL = "fgt.consultorias@gmail.com";

export async function getDefaultUser() {
  let user = await prisma.user.findUnique({ where: { email: DEFAULT_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: { name: "Fernando Gomes", email: DEFAULT_EMAIL },
    });
  }
  return user;
}
