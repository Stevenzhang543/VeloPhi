/** Editor and measuring tool icon paths (24 × 24 grid, stroked with currentColor). Drawn for Verity. */

/** SVG path data by icon name. */
export const EDITOR_ICONS: Record<string, string> = {
  // Object tools
  wedge: 'M4 19h16L4 9zM14 5h6M16 2.5h4',
  polygon: 'M12 3.5l8 5.8-3 10.2H7L4 9.3zM12 3.5v.01M20 9.3v.01M17 19.5v.01M7 19.5v.01M4 9.3v.01',
  // Measuring and annotation tools
  ruler: 'M3 16L16 3l5 5L8 21zM7 12l2 2M10 9l1.5 1.5M12 7l2 2M15 4l1.5 1.5M5 14l1.5 1.5',
  protractor: 'M4 20h16M4 20L15 6M11 20a7 7 0 0 0-2.6-5.5',
  text: 'M5 7V4.5h14V7M12 4.5V20M9 20h6',
  arrow: 'M5 19L18.5 5.5M10 5h9v9',
  // Context menu
  paste: 'M9 3.5h6v3H9zM15 5h3v16H6V5h3M9 12h6M9 16h4',
  duplicate: 'M8 8h12v12H8zM4 16V4h12M14 11v6M11 14h6',
  front: 'M12 20V9M7.5 13.5L12 9l4.5 4.5M5 4.5h14',
  back: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14',
  anchor: 'M12 7v13M5 13a7 7 0 0 0 14 0M9 10h6M12 3a2 2 0 1 1 0 4a2 2 0 1 1 0-4',
  unlock: 'M6 11h12v9H6zM9 11V7.5a3 3 0 0 1 5.8-1.1M12 14.5v2',
  norotate: 'M18.5 12a6.5 6.5 0 1 1-1.9-4.6M17 3.5v4h-4M4 20L20 4',
  zero: 'M4 12h9M9.5 8.5L13 12l-3.5 3.5M18 5v14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 12h6',
  snap: 'M4 4h16v16H4zM4 12h16M12 4v16M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'
}
