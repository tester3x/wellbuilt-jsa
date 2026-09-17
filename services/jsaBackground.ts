export type JsaBackgroundPackage =
  | 'water-hauling'
  | 'ltl'
  | 'aggregate'
  | 'transportation';

type CustomJobType = { label: string; packages: string[] };

const aliases: Record<string, JsaBackgroundPackage> = {
  'water-hauling': 'water-hauling',
  water: 'water-hauling',
  oilfield: 'water-hauling',
  'oil-field': 'water-hauling',
  ltl: 'ltl',
  freight: 'ltl',
  'less-than-truckload': 'ltl',
  aggregate: 'aggregate',
  aggregates: 'aggregate',
  quarry: 'aggregate',
  transportation: 'transportation',
  transport: 'transportation',
};

const waterJobTypes = [
  'production water', 'fresh water', 'flowback water', 'pit water',
  'invert', 'service work', 'vac work', 'pushers', 'rig work',
  'fuel service',
];

function key(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

export function normalizeBackgroundPackage(value: unknown): JsaBackgroundPackage | null {
  const normalized = key(value);
  if (!normalized) return null;
  if (aliases[normalized]) return aliases[normalized];
  if (normalized.includes('aggregate') || normalized.includes('quarry') || normalized.includes('gravel') || normalized.includes('sand')) return 'aggregate';
  if (normalized.includes('ltl') || normalized.includes('freight') || normalized.includes('linehaul') || normalized.includes('line-haul') || normalized.includes('delivery')) return 'ltl';
  if (normalized.includes('water') || normalized.includes('oilfield') || normalized.includes('oil-field')) return 'water-hauling';
  return null;
}

export function resolveJobTypePackage(
  jobType: unknown,
  customJobTypes: CustomJobType[] = [],
): JsaBackgroundPackage | null {
  const value = String(jobType || '').trim();
  if (!value) return null;

  const custom = customJobTypes.find(item => key(item.label) === key(value));
  if (custom) {
    for (const packageId of custom.packages || []) {
      const resolved = normalizeBackgroundPackage(packageId);
      if (resolved) return resolved;
    }
  }

  const direct = normalizeBackgroundPackage(value);
  if (direct) return direct;

  const lower = value.toLowerCase();
  if (waterJobTypes.some(label => lower === label || lower.includes(label))) return 'water-hauling';
  if (/\b(rock|stone|asphalt|concrete)\b/.test(lower)) return 'aggregate';
  if (/\b(dock|pallet|warehouse|truckload)\b/.test(lower)) return 'ltl';
  return null;
}

export function resolveCompanyBackground(
  activePackages: unknown,
): JsaBackgroundPackage {
  if (!Array.isArray(activePackages)) return 'transportation';
  const resolved = activePackages
    .map(normalizeBackgroundPackage)
    .filter((item): item is JsaBackgroundPackage => !!item && item !== 'transportation');
  return new Set(resolved).size === 1 ? resolved[0] : 'transportation';
}
