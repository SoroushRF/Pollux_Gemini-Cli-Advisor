export function formatLaunchReason(decision) {
  return `selected ${decision.key} with adjusted score ${decision.adjustedScore}: ${decision.reason}`;
}
