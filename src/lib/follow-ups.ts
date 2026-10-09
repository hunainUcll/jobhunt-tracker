import "server-only";
import { db } from "./db";
import { followUpDate, suggestedReply } from "./domain";
export async function refreshFollowUps() {
  const [apps, settings] = await Promise.all([
    db.application.findMany({ include: { company: true, contact: true } }),
    db.userSettings.findUnique({ where: { id: "local" } }),
  ]);
  for (const a of apps) {
    const due = followUpDate(a);
    const existing = await db.followUp.findFirst({
      where: { applicationId: a.id, completedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!due) {
      if (existing)
        await db.followUp.updateMany({
          where: { applicationId: a.id, completedAt: null },
          data: { completedAt: new Date() },
        });
      continue;
    }
    const data = {
      dueAt: due,
      suggestedText: suggestedReply(a, settings?.name || "Alex"),
    };
    if (existing)
      await db.followUp.update({ where: { id: existing.id }, data });
    else await db.followUp.create({ data: { ...data, applicationId: a.id } });
  }
  return db.followUp.findMany({
    where: { completedAt: null },
    include: { application: { include: { company: true, contact: true } } },
    orderBy: { dueAt: "asc" },
  });
}
