export const convertHexToHSLA = (
  configuredColor: string,
  alpha: number
): string => {
  const hex = configuredColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);

  return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
};

export const getHSLAColorForCategory = (
  category: string,
  alpha: number,
  newBackgroundColors: { [x: string]: any }
): string => {
  const color = newBackgroundColors[category];
  const match = color.match(/hsla\((\d+), (\d+)%?, (\d+)%?, (\d+\.?\d*?)\)/);
  return match
    ? `hsla(${match[1]}, ${match[2]}%, ${match[3]}%, ${alpha})`
    : color;
};

export const getRandomHSLAColor = (
  alpha: number,
  existingHues: number[] = []
): string => {
  const huePool = Array.from({ length: 360 }, (_, i) => i);
  existingHues.forEach((hue) => {
    const index = huePool.indexOf(hue);
    if (index > -1) {
      huePool.splice(index, 1);
    }
  });

  huePool.sort(() => Math.random() - 0.5);

  let maxDistance = -1;
  let bestHue = 0;

  huePool.forEach((candidateHue) => {
    const distances = existingHues.map((existingHue) => {
      const distance = Math.min(
        Math.abs(candidateHue - existingHue),
        360 - Math.abs(candidateHue - existingHue)
      );
      return distance;
    });
    const minDistance = Math.min(...distances);
    if (minDistance > maxDistance) {
      maxDistance = minDistance;
      bestHue = candidateHue;
    }
  });

  return `hsla(${bestHue}, 80%, 80%, ${alpha})`;
};
