import { prisma } from './prisma';
import { Prisma } from '@prisma/client';

type PrismaClientOrTx = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

interface Condition {
  key_id: string;
  value: string;
}

function parseConditions(raw: Prisma.JsonValue): Condition[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter(
    (c): c is Condition =>
      c != null &&
      typeof c === 'object' &&
      typeof (c as Record<string, unknown>).key_id === 'string' &&
      typeof (c as Record<string, unknown>).value === 'string',
  );
}

/**
 * When a metadata value is renamed (e.g. a Person or DocumentType is renamed),
 * update all permission rule conditions that reference the old value so they
 * continue to match files correctly.
 */
export async function cascadeRuleConditionsOnValueRename(
  companyId: string,
  keyName: string,
  oldValue: string,
  newValue: string,
  client: PrismaClientOrTx = prisma,
): Promise<void> {
  if (oldValue === newValue) return;

  const key = await client.filesMetadataKey.findFirst({
    where: { company_id: companyId, name: keyName },
    select: { id: true },
  });
  if (!key) return;

  const rules = await client.documentPermissionRule.findMany({
    where: { company_id: companyId },
    select: { id: true, conditions: true },
  });

  for (const rule of rules) {
    const conditions = parseConditions(rule.conditions);
    if (!conditions.some((c) => c.key_id === key.id && c.value === oldValue)) continue;

    const updated = conditions.map((c) =>
      c.key_id === key.id && c.value === oldValue ? { ...c, value: newValue } : c,
    );
    await client.documentPermissionRule.update({
      where: { id: rule.id },
      data: { conditions: updated as unknown as Prisma.InputJsonValue },
    });
  }
}

/**
 * When a metadata value is deleted (e.g. a Person or DocumentType is deleted),
 * clean up permission rule conditions that reference it.
 * - If removing the condition leaves the rule with no conditions (= allow all),
 *   the entire rule is deleted to avoid unintended open access.
 * - Otherwise only the matching condition is removed.
 */
export async function cascadeRuleConditionsOnValueDelete(
  companyId: string,
  keyName: string,
  deletedValue: string,
  client: PrismaClientOrTx = prisma,
): Promise<void> {
  const key = await client.filesMetadataKey.findFirst({
    where: { company_id: companyId, name: keyName },
    select: { id: true },
  });
  if (!key) return;

  const rules = await client.documentPermissionRule.findMany({
    where: { company_id: companyId },
    select: { id: true, conditions: true },
  });

  for (const rule of rules) {
    const conditions = parseConditions(rule.conditions);
    if (!conditions.some((c) => c.key_id === key.id && c.value === deletedValue)) continue;

    const remaining = conditions.filter(
      (c) => !(c.key_id === key.id && c.value === deletedValue),
    );

    if (remaining.length === 0) {
      // Deleting the last condition would make the rule match everything — safer to remove the rule.
      await client.documentPermissionRule.delete({ where: { id: rule.id } });
    } else {
      await client.documentPermissionRule.update({
        where: { id: rule.id },
        data: { conditions: remaining as unknown as Prisma.InputJsonValue },
      });
    }
  }
}
