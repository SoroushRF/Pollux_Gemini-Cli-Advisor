External integrations may still call formatShade. Source internals should
migrate to renderShade as the canonical name. The registry must expose
renderShade while compatibility surfaces keep formatShade.
