/**
 * Server-authored jsaBinding is the sole shift authority.
 * Cached IDs, URL shift, and device/UTC dates are never identity.
 */
export type JsaShiftState = 'open' | 'none';

export interface JsaBinding {
  shiftState: JsaShiftState;
  periodId?: string;
  originLocalDate?: string;
  requiresActiveShift: boolean;
  jsaEnabled: boolean;
}

export type BindingSurface =
  | { kind: 'open'; periodId: string; originLocalDate: string; mayLabelActive: true }
  | { kind: 'none'; mayLabelActive: false; ownerOperator: true }
  | { kind: 'refused'; reason: 'unavailable' | 'mismatch' | 'required_missing' | 'stale_cache' };

export function isJsaBinding(v: unknown): v is JsaBinding {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (typeof o.requiresActiveShift !== 'boolean' || typeof o.jsaEnabled !== 'boolean') return false;
  const keys = Object.keys(o);
  if (o.shiftState === 'open') {
    if (keys.length !== 5) return false;
    if (typeof o.periodId !== 'string' || !/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(o.periodId)) return false;
    if (typeof o.originLocalDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.originLocalDate)) return false;
    return o.periodId.slice(0, 10) === o.originLocalDate;
  }
  if (o.shiftState === 'none') return keys.length === 3;
  return false;
}

export function decideFromJsaBinding(input: {
  binding: JsaBinding | null;
  cachedShiftId?: string | null;
}): BindingSurface {
  if (!input.binding) return { kind: 'refused', reason: 'unavailable' };
  if (input.binding.shiftState === 'open' && input.binding.periodId && input.binding.originLocalDate) {
    // Server period wins. A June cache next to an August binding is discarded,
    // never labeled current.
    return {
      kind: 'open',
      periodId: input.binding.periodId,
      originLocalDate: input.binding.originLocalDate,
      mayLabelActive: true,
    };
  }
  if (input.binding.shiftState === 'none') {
    if (input.binding.requiresActiveShift) {
      return { kind: 'refused', reason: 'required_missing' };
    }
    return { kind: 'none', mayLabelActive: false, ownerOperator: true };
  }
  return { kind: 'refused', reason: 'mismatch' };
}

export function historicalMustStayHistorical(
  saveShiftId: string | null,
  currentPeriodId: string | null,
): boolean {
  if (!saveShiftId || !currentPeriodId) return true;
  return saveShiftId !== currentPeriodId;
}
