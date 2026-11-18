type PreparationItem = { id: string; label?: string };

const repeatsSectionTitle = (item: PreparationItem) =>
  item.label?.trim().replace(/\s+/g, ' ').toLowerCase() === 'i am prepared for work';

/** The section title states the declaration; its individual checks stay visible. */
export function preparationChecks<T extends PreparationItem>(items: readonly T[]): T[] {
  return items.filter(item => !repeatsSectionTitle(item));
}

/** Retain the assessment's original answer IDs without asking the same question
 * twice. The heading declaration is confirmed only when every actual check is.
 * This projects new form answers; it never rewrites an existing signed record.
 */
export function preparationAnswers(
  items: readonly PreparationItem[],
  answers: Readonly<Record<string, boolean>>,
): Record<string, boolean> {
  const result = { ...answers };
  const complete = allPreparationConfirmed(preparationChecks(items), answers);
  for (const item of items) if (repeatsSectionTitle(item)) result[item.id] = complete;
  return result;
}

/** Every preparation confirmation shown for this assessment is required. */
export function allPreparationConfirmed(
  items: readonly { id: string }[],
  answers: Readonly<Record<string, boolean>>,
): boolean {
  return items.every(item => answers[item.id] === true);
}
