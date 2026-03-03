import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedRbacRoles() {
  const companies = await prisma.company.findMany({ select: { id: true } });

  for (const company of companies) {
    // Create Admin system role if not exists
    await prisma.role.upsert({
      where: { company_id_name: { company_id: company.id, name: 'Admin' } },
      update: {},
      create: {
        name: 'Admin',
        description: 'Full access to all features and data',
        company_id: company.id,
        is_system: true,
      },
    });

    // Create Member system role if not exists
    await prisma.role.upsert({
      where: { company_id_name: { company_id: company.id, name: 'Member' } },
      update: {},
      create: {
        name: 'Member',
        description: 'Default role with limited baseline access',
        company_id: company.id,
        is_system: true,
      },
    });
  }

  console.log(`Seeded RBAC roles for ${companies.length} companies`);
}

seedRbacRoles()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
