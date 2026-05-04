// Live triangle count display with green/yellow/red zones.
const GREEN_MAX = 80000;
const YELLOW_MAX = 150000;

export function updateTriangleCounter(count) {
  const text = document.getElementById('tri-text');
  const dot = document.querySelector('#tri-counter .dot');
  if (!text || !dot) return;
  const rounded = Math.round(count);
  let color = '#7ed957';
  let label = 'green';
  if (rounded > YELLOW_MAX) { color = '#ff5b5b'; label = 'red'; }
  else if (rounded > GREEN_MAX) { color = '#ffd24a'; label = 'yellow'; }
  dot.style.background = color;
  text.textContent = `${rounded.toLocaleString()} triangles${label === 'red' ? ' ⚠ over budget' : ''}`;
}
