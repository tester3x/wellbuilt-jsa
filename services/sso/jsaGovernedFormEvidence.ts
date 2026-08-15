/**
 * Governed form-evidence boundary: printed name, step acknowledgments,
 * and submit fail-closed. Import-free. Does not invent identity sources
 * or default step evidence to true.
 */

export type FormEvidenceSource =
  | 'governed_snapshot'
  | 'nav_params'
  | 'blocked'
  | 'completed'
  | 'acknowledge_only';

export type GovernedPrintedNameDecision =
  | { kind: 'ok'; printedName: string }
  | { kind: 'standalone' }
  | { kind: 'fail_closed'; reason: 'missing_legal_name' };

export type GovernedStepEvidence = {
  stepAcks: Record<string, boolean>;
  stepsAcknowledged: boolean;
};

export type GovernedSubmitEvidenceDecision =
  | {
      kind: 'ok';
      printedName: string;
      stepAcks: Record<string, boolean>;
      stepsAcknowledged: boolean;
    }
  | {
      kind: 'fail_closed';
      reason: 'missing_legal_name' | 'missing_step_evidence' | 'missing_signature';
    }
  | {
      kind: 'standalone';
      printedName: string;
      stepAcks: Record<string, boolean>;
      stepsAcknowledged: boolean;
    };

function trimName(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Governed printed name is authenticated session legalName only.
 * Hostile route/driverName/displayName/passcode/draft values are not inputs.
 */
export function decideGovernedPrintedName(input: {
  source: FormEvidenceSource | null | undefined;
  legalName?: string | null;
}): GovernedPrintedNameDecision {
  if (input.source === 'nav_params') return { kind: 'standalone' };
  if (input.source !== 'governed_snapshot') {
    return { kind: 'fail_closed', reason: 'missing_legal_name' };
  }
  const printedName = trimName(input.legalName);
  if (!printedName) return { kind: 'fail_closed', reason: 'missing_legal_name' };
  return { kind: 'ok', printedName };
}

export function emptyStepEvidence(): GovernedStepEvidence {
  return { stepAcks: {}, stepsAcknowledged: false };
}

/** Record only steps the driver actually progressed through. Never default true. */
export function buildStepEvidence(
  requiredStepIds: string[],
  acknowledged: Record<string, boolean> | null | undefined,
): GovernedStepEvidence {
  const src = acknowledged && typeof acknowledged === 'object' ? acknowledged : {};
  const stepAcks: Record<string, boolean> = {};
  const ids = Array.isArray(requiredStepIds) ? requiredStepIds : [];
  let all = ids.length > 0;
  for (const id of ids) {
    if (typeof id !== 'string' || !id) {
      all = false;
      continue;
    }
    if (src[id] === true) stepAcks[id] = true;
    else all = false;
  }
  return { stepAcks, stepsAcknowledged: all };
}

export function requiredStepEvidencePresent(input: {
  requiredStepIds: string[];
  stepAcks?: Record<string, boolean> | null;
  stepsAcknowledged?: boolean;
}): boolean {
  const ids = Array.isArray(input.requiredStepIds) ? input.requiredStepIds : [];
  if (ids.length === 0) return false;
  if (input.stepsAcknowledged !== true) return false;
  const acks = input.stepAcks && typeof input.stepAcks === 'object' ? input.stepAcks : {};
  return ids.every((id) => typeof id === 'string' && !!id && acks[id] === true);
}

export function decideGovernedSubmitEvidence(input: {
  source: FormEvidenceSource | null | undefined;
  legalName?: string | null;
  standalonePrintedName?: string | null;
  signatureImage?: string | null;
  requiredStepIds: string[];
  stepAcks?: Record<string, boolean> | null;
  stepsAcknowledged?: boolean;
}): GovernedSubmitEvidenceDecision {
  const steps = buildStepEvidence(input.requiredStepIds, input.stepAcks || {});
  if (input.source === 'nav_params') {
    return {
      kind: 'standalone',
      printedName: trimName(input.standalonePrintedName),
      stepAcks: steps.stepAcks,
      stepsAcknowledged: steps.stepsAcknowledged,
    };
  }
  const printed = decideGovernedPrintedName({
    source: input.source,
    legalName: input.legalName,
  });
  if (printed.kind !== 'ok') {
    return { kind: 'fail_closed', reason: 'missing_legal_name' };
  }
  if (!requiredStepEvidencePresent({
    requiredStepIds: input.requiredStepIds,
    stepAcks: steps.stepAcks,
    stepsAcknowledged: steps.stepsAcknowledged,
  })) {
    return { kind: 'fail_closed', reason: 'missing_step_evidence' };
  }
  const png = typeof input.signatureImage === 'string' ? input.signatureImage.trim() : '';
  if (!png) return { kind: 'fail_closed', reason: 'missing_signature' };
  return {
    kind: 'ok',
    printedName: printed.printedName,
    stepAcks: steps.stepAcks,
    stepsAcknowledged: true,
  };
}
