// Presentation state only. The protected request and submission validator still
// decide whether authored evidence can be recorded.
exports.preparedReadPosition = function (steps, draft) {
  const allSteps = steps.every(step => draft.stepAcks[step.id] === true);
  const requested = draft.screen;
  const screen = requested === 'steps' || requested === 'ppe' || requested === 'review' ? requested
    : allSteps && (draft.signature || Object.keys(draft.prepared).length) ? 'review' : allSteps ? 'ppe' : 'steps';
  const index = Math.max(0, Math.min(steps.length - 1, Number.isInteger(draft.stepIndex) ? draft.stepIndex
    : Math.max(0, steps.findIndex(step => !draft.stepAcks[step.id]))));
  return { screen: !allSteps && screen !== 'steps' ? 'steps' : screen, index, allSteps };
};
exports.nextPreparedRead = function (steps, draft) {
  const { screen, index, allSteps } = exports.preparedReadPosition(steps, draft);
  if (screen === 'ppe') return allSteps ? { ...draft, screen: 'review' } : draft;
  if (screen !== 'steps') return draft;
  const step = steps[index];
  return { ...draft, stepAcks: { ...draft.stepAcks, ...(step ? { [step.id]: true } : {}) },
    screen: index >= steps.length - 1 ? 'ppe' : 'steps', stepIndex: index + 1 };
};
