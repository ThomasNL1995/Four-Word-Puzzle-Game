// Taps and drag and drop for the board, with Pointer Events, so one code path covers mouse,
// touch and pen. (The HTML5 drag-and-drop API does not fire for touch input.)
//
// A press on an element matching `selector` that moves less than THRESHOLD pixels is a tap.
// A press on an element with a `data-tile` attribute that moves further is a drag.
// Taps are detected here instead of with "click", because after a touch drag some browsers
// skip the click of the next tap.

const THRESHOLD = 6;

export interface PointerHandlers {
  /** Elements that react to taps or can be dragged. */
  selector: string;
  canDrag(tile: number): boolean;
  onTap(target: HTMLElement): void;
  /** Called while dragging with the element under the pointer (or null). */
  onDragOver(target: Element | null): void;
  /** Called when the tile is released over `target` (null when outside the page). */
  onDrop(tile: number, target: Element | null): void;
}

interface Press {
  pointerId: number;
  startX: number;
  startY: number;
  source: HTMLElement;
  tile: number | null;
  ghost: HTMLElement | null;
  offsetX: number;
  offsetY: number;
}

export function enablePointerInput(handlers: PointerHandlers): void {
  let press: Press | null = null;
  // A mouse still fires "click" after pointerup. Handled presses must not also click
  // whatever ends up under the pointer (for example a button after a drop).
  let suppress: { until: number; x: number; y: number } | null = null;

  const startGhost = (p: Press) => {
    const rect = p.source.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = p.source.textContent;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.fontSize = getComputedStyle(p.source).fontSize;
    document.body.appendChild(ghost);
    p.ghost = ghost;
    p.offsetX = p.startX - rect.left;
    p.offsetY = p.startY - rect.top;
    p.source.classList.add("dragging-source");
  };

  const moveGhost = (p: Press, x: number, y: number) => {
    // Slightly bigger than the tile, so it is visible next to a finger.
    p.ghost!.style.transform = `translate(${x - p.offsetX}px, ${y - p.offsetY}px) scale(1.1)`;
  };

  const end = () => {
    if (!press) return;
    if (press.ghost) {
      press.ghost.remove();
      press.source.classList.remove("dragging-source");
      handlers.onDragOver(null);
    }
    press = null;
  };

  document.addEventListener("pointerdown", (e) => {
    if (press || !e.isPrimary || e.button !== 0) return;
    const source = (e.target as Element).closest<HTMLElement>(handlers.selector);
    if (!source) return;
    const tile = source.dataset.tile === undefined ? null : Number(source.dataset.tile);
    press = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, source, tile, ghost: null, offsetX: 0, offsetY: 0 };
  });

  document.addEventListener(
    "pointermove",
    (e) => {
      if (!press || e.pointerId !== press.pointerId) return;
      if (!press.ghost) {
        if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) < THRESHOLD) return;
        if (press.tile === null || !handlers.canDrag(press.tile)) {
          press = null; // moved too far for a tap, and nothing to drag
          return;
        }
        startGhost(press);
      }
      e.preventDefault();
      moveGhost(press, e.clientX, e.clientY);
      handlers.onDragOver(document.elementFromPoint(e.clientX, e.clientY));
    },
    { passive: false }
  );

  document.addEventListener("pointerup", (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    const { tile, ghost, source } = press;
    end();
    suppress = { until: performance.now() + 500, x: e.clientX, y: e.clientY };
    if (ghost) handlers.onDrop(tile!, document.elementFromPoint(e.clientX, e.clientY));
    else handlers.onTap(source);
  });

  document.addEventListener("pointercancel", (e) => {
    if (press && e.pointerId === press.pointerId) end();
  });

  document.addEventListener(
    "click",
    (e) => {
      const s = suppress;
      suppress = null;
      if (s && performance.now() < s.until && Math.hypot(e.clientX - s.x, e.clientY - s.y) < THRESHOLD * 4) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true
  );
}
