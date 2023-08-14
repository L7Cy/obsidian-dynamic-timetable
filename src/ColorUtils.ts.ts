export const getRGBAColor = (configuredColor: string, alpha: number): string => {
  const hex = configuredColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const getHSLAColor = (
  category: string,
  alpha: number,
  newBackgroundColors: { [x: string]: any; }
): string => {
  const color = newBackgroundColors[category];
  const match = color.match(/hsla\((\d+), (\d+)%?, (\d+)%?, (\d+\.?\d*?)\)/);
  return match ? `hsla(${match[1]}, ${match[2]}%, ${match[3]}%, ${alpha})` : color;
};

export const getRandomHSLAColor = (alpha: number): string => {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 80;
  const lightness = 80;
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
};