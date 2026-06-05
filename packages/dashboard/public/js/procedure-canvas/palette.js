// palette.js — left-rail drag palette for the procedure canvas
// Renders draggable node-type cards; uses HTML5 dragstart with a custom
// MIME type so only the canvas drop zone accepts them.

import { NODE_TYPES } from './node-types.js';

const PALETTE_TYPES = ['trigger', 'channel-send', 'specialist-call', 'condition', 'wait'];

/**
 * Mount the palette into `container`.
 * `onDragStart(typeId)` is called when the user begins dragging a card.
 */
export function mountPalette(container, onDragStart) {
  container.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'pcanvas-palette-heading';
  heading.textContent = 'Nodes';
  container.appendChild(heading);

  for (const typeId of PALETTE_TYPES) {
    const def = NODE_TYPES[typeId];
    if (!def) continue;

    const card = document.createElement('div');
    card.className = 'pcanvas-palette-card';
    card.draggable = true;
    card.dataset.nodeType = typeId;
    card.title = def.description || def.label;
    card.style.setProperty('--node-color',  def.color);
    card.style.setProperty('--node-border', def.borderColor);

    card.innerHTML = `
      <span class="pcanvas-palette-icon">${def.icon}</span>
      <span class="pcanvas-palette-label">${def.label}</span>
    `;

    card.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/penelope-node-type', typeId);
      if (onDragStart) onDragStart(typeId);
    });

    card.addEventListener('dragend', () => {
      card.style.opacity = '';
    });

    container.appendChild(card);
  }
}
