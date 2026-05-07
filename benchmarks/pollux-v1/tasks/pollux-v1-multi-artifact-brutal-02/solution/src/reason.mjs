export function formatLaunchReason(decision) {
  return `selected ${decision.key} for ${decision.channel}/${decision.region} with adjusted score ${decision.adjustedScore}: ${decision.reason}`;
}
