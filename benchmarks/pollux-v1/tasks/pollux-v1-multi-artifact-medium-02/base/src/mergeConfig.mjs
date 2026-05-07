export function mergeConfig(defaults, override, denylist) {
  return {
    mode: override.mode ?? defaults.mode,
    features: [...defaults.features, ...(override.addFeatures ?? [])].filter(
      (feature) => !(override.disableFeatures ?? []).includes(feature),
    ),
  };
}
