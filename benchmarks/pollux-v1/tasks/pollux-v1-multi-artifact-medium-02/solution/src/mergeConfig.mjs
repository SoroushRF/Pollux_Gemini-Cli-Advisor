export function mergeConfig(defaults, override, denylist) {
  const denied = new Set(denylist);
  const disabled = new Set(override.disableFeatures ?? []);
  const features = [];
  for (const feature of defaults.features ?? []) {
    if (!disabled.has(feature) && !denied.has(feature) && !features.includes(feature)) {
      features.push(feature);
    }
  }
  for (const feature of override.addFeatures ?? []) {
    if (!denied.has(feature) && !features.includes(feature)) {
      features.push(feature);
    }
  }
  return {
    mode: override.mode ?? defaults.mode,
    features,
  };
}
