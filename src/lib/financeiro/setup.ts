// Garante que o vocabulário oficial e os custos fixos existem no banco.
// Idempotente: pode rodar a cada captura sem duplicar nada.

import { prisma } from "@/lib/prisma";
import { buildVocab, planSeed, SEED_RECURRING_COSTS, type Vocab } from "./vocab";

export async function ensureFinanceSetup(userId: string): Promise<Vocab> {
  const rows = await prisma.financialConfig.findMany({ where: { userId } });
  const plan = planSeed(rows);

  if (plan.create.length > 0) {
    await prisma.financialConfig.createMany({
      data: plan.create.map((c) => ({
        userId,
        type: c.type,
        value: c.value,
        group: c.group,
        account: c.account,
        order: c.order,
      })),
    });
  }
  for (const u of plan.update) {
    await prisma.financialConfig.update({
      where: { id: u.id },
      data: { group: u.group, account: u.account },
    });
  }

  const recurringCount = await prisma.recurringCost.count({ where: { userId } });
  if (recurringCount === 0) {
    await prisma.recurringCost.createMany({
      data: SEED_RECURRING_COSTS.map((c) => ({ ...c, userId })),
    });
  }

  const changed = plan.create.length > 0 || plan.update.length > 0;
  const fresh = changed ? await prisma.financialConfig.findMany({ where: { userId } }) : rows;
  return buildVocab(fresh);
}
