/** Every preparation confirmation shown for this assessment is required. */
export function allPreparationConfirmed(
  items: readonly { id: string }[],
  answers: Readonly<Record<string, boolean>>,
): boolean {
  return items.every(item => answers[item.id] === true);
}
