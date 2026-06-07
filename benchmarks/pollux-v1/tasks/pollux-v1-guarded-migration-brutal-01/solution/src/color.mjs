export function renderShade(value) {
  return `shade:${value.toLowerCase()}`;
}

export const formatShade = renderShade;

export const compatibility = {
  formatShade,
  renderShade,
};
