// Color palette for the PDF editor
export const COLORS = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
  '#ffff00', '#ff00ff', '#00ffff', '#ff6600', '#6600ff',
  '#006600', '#660000', '#000066', '#666666', '#999999',
];

// Available font sizes
export const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];

// Available font families
export const FONT_FAMILIES = [
  'Arial', 
  'Helvetica', 
  'Times New Roman', 
  'Courier New', 
  'Georgia', 
  'Verdana'
];

// Default tool settings
export const DEFAULT_TOOL_SETTINGS = {
  strokeColor: '#000000',
  fillColor: 'transparent',
  strokeWidth: 2,
  fontSize: 16,
  fontFamily: 'Arial',
  isBold: false,
  isItalic: false,
  isUnderline: false,
};

// Base scale for PDF rendering (for better quality)
export const PDF_BASE_SCALE = 1.5;

// Zoom limits
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.25;
