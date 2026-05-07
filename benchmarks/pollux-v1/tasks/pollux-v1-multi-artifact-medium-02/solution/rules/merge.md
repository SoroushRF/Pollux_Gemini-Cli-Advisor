Use override.mode when present. Start with default features in order. Remove
disabled and denylisted features. Append added features not already present and
not denied. Export mergeConfig(defaults, override, denylist).
effective-config.json must match the repository inputs.
