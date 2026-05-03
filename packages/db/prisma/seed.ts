import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const event = await prisma.event.upsert({
    where: { slug: 'rali-algarve-2026' },
    update: { active: true },
    create: {
      slug: 'rali-algarve-2026',
      name: 'Rali do Algarve 2026',
      startsAt: new Date('2026-05-15T08:00:00Z'),
      endsAt: new Date('2026-05-17T18:00:00Z'),
      active: true,
    },
  });

  const stages = [
    { slug: 'pec1', name: 'PEC 1 — Monchique', order: 1, hour: 9 },
    { slug: 'pec2', name: 'PEC 2 — Fóia', order: 2, hour: 11 },
    { slug: 'pec3', name: 'PEC 3 — Silves', order: 3, hour: 14 },
    { slug: 'pec4', name: 'PEC 4 — Almodôvar', order: 4, hour: 16 },
    { slug: 'pec5', name: 'PEC 5 — Loulé', order: 5, hour: 18 },
  ];

  for (const s of stages) {
    await prisma.stage.upsert({
      where: { eventId_slug: { eventId: event.id, slug: s.slug } },
      update: {},
      create: {
        eventId: event.id,
        slug: s.slug,
        name: s.name,
        order: s.order,
        scheduledAt: new Date(`2026-05-15T${String(s.hour).padStart(2, '0')}:00:00Z`),
      },
    });
  }

  console.log(`Seed OK: evento "${event.name}" com ${stages.length} PECs`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
