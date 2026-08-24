export interface StrictSessionStorage {
  readRaw(): Promise<string | null>;
  deleteRaw(): Promise<void>;
}

export async function strictClearRawSessionIfGeneration(
  used: string,
  storage: StrictSessionStorage,
  parseGeneration: (raw: string) => string | null,
): Promise<boolean> {
  const raw = await storage.readRaw();
  if (raw === null) return false;
  const generation = parseGeneration(raw);
  if (!generation || generation !== used) return false;
  await storage.deleteRaw();
  return (await storage.readRaw()) === null;
}
