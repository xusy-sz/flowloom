# flowloom Usage Manual

For host developers embedding flowloom into their own apps: from the assembly baseline to every capability. Targets flowloom 1.32+; examples are TypeScript — JS hosts can drop the type annotations.

Documentation map: the pitch and feature overview live in the [README](../README.md) ([中文](../README.zh-CN.md)); this is the English mirror of the manual, the Chinese source face is [usage.md](usage.md). Release history: `CHANGELOG.md` (Chinese).

## Table of contents

- [Assembly baseline](#assembly-baseline)
- [Node registry](#node-registry)
- [Node placement](#node-placement)
- [Wiring and connection validation](#wiring-and-connection-validation)
- [Selection, copy, and undo](#selection-copy-and-undo)
- [Groups, subgraphs, and edge paths](#groups-subgraphs-and-edge-paths)
- [Layout and alignment](#layout-and-alignment)
- [Command registry and keybindings](#command-registry-and-keybindings)
- [Accessibility (keyboard and aria)](#accessibility-keyboard-and-aria)
- [Presentation customization](#presentation-customization)
- [Satellite components](#satellite-components)
- [External data sources and AI agent integration](#external-data-sources-and-ai-agent-integration)
- [Persistence](#persistence)
- [PNG·SVG export](#pngsvg-export)
- [TS type narrowing](#ts-type-narrowing)
- [Headless kernel](#headless-kernel)
- [API reference](#api-reference)
- [Local demo pages](#local-demo-pages)
- [dist entry and source consumption](#dist-entry-and-source-consumption)

## Assembly baseline

flowloom is a two-piece set: a framework-agnostic kernel (`flowloom/kernel`, pure TypeScript, zero DOM dependencies) + a Svelte 5 rendering layer (`flowloom/svelte`). Zero runtime dependencies; the only peerDependency is `svelte ^5`.

```js
import { createNodeRegistry, createGraph } from 'flowloom/kernel';
import { createCanvasController, CanvasView } from 'flowloom/svelte';
import 'flowloom/tokens.css'; // light default + dark override, a two-segment token sheet

const registry = createNodeRegistry([{ typeId: 'step', label: 'Step', inputs: [], outputs: [] }]);
const controller = createCanvasController({ registry, initialGraph: createGraph() });
// Svelte host: <CanvasView {controller} />
// Non-compiled host (browser extension etc.): mount(CanvasView, { target: el, props: { controller } })
```

Theming: with no attribute set, `tokens.css` follows the system `prefers-color-scheme`; setting `<html data-fl-theme="dark|light">` locks the theme explicitly (the attribute and its persistence belong to the host shell; apply before first paint to avoid a flash):

```js
const choice = localStorage.getItem('theme'); // '' | 'light' | 'dark'
if (choice === 'dark' || choice === 'light') {
  document.documentElement.dataset.flTheme = choice;
} // no value = follow the system
```

One controller per canvas. Satellite components (NodeSearchBox / PropertiesPanel / Minimap / SelectionToolbox / ContextMenu) share the same controller as the canvas; mount each where you need it. `CanvasView` ships its own DOM event normalization pipeline: wheel zoom (pointer-anchored), space/middle-drag panning, and FitView work out of the box.

Three commonly missed items: ① `tokens.css` must be imported (otherwise components fall back to built-in light values); ② the theme attribute goes on `<html>`; ③ container sizes are measured by the host (except Minimap — see [Satellite components](#satellite-components)).

## Node registry

The node registry is host data: the library enumerates no node types; `createNodeRegistry([...])` injects an open set. Each `NodeTypeDef` declares the node's shape:

```js
createNodeRegistry([
  {
    typeId: 'ckpt',                    // type identifier (host-defined)
    label: 'Checkpoint',               // display name
    color: '#b39ddb',                  // optional: category color, tints the title band
    edgeShape: 'step',                 // optional: shape of edges sourced by this type
    inputs: [{ portId: 'in', label: 'In' }],
    outputs: [{ portId: 'out', label: 'Out', typeId: 'model' }], // port typeId = data type id
    widgets: [                          // optional: controls for node body & properties panel
      { name: 'steps', kind: 'number', label: 'Steps', min: 1, max: 150 },
      { name: 'mode', kind: 'enum', label: 'Sampler', options: ['euler', 'ddim'] },
    ],
    initialData: () => ({ status: 'todo' }), // optional: seeding factory (see below)
  },
]);
```

Built-in widget kinds: `text` / `number` / `boolean` / `enum` / `textarea`; custom kinds take over via the registration slot (see [Presentation customization](#presentation-customization)). A port's `typeId` is a data type id: port dots and links take the `--fl-port-{typeId}` / `--fl-link-{typeId}` open token set (values come from host CSS; undeclared falls back to neutral):

```css
:root { --fl-port-model: #b39ddb; --fl-link-model: #b39ddb; }
```

### initialData seeding

A registry entry may declare an `initialData?: () => Record<string, unknown>` factory, called at placement time to produce the node's initial data: the official channel for widget defaults and required-field seeds. The factory must return a fresh object (called once per placement; a bare object literal would be shared across same-type nodes, corrupting clone and undo semantics). All three placement routes (`placeNode` / `placeNodeConnected` / search-box confirm, sidebar drop) consume the seed uniformly; it lands inside the placement's single snapshot, so one undo removes node, edge, and seed together:

```js
const registry = createNodeRegistry([
  {
    typeId: 'phase',
    label: 'Phase',
    inputs: [],
    outputs: [{ portId: 'next', label: 'Next' }],
    initialData: () => ({ status: 'todo', level: 1 }),
  },
]);
```

Boundaries: entries without `initialData` and unregistered types still get `data: {}`; `addNode` is a fully self-contained channel that takes data directly and is not seeded; the external gate is unaffected (the `entry.data` channel already exists); factory throws propagate (placement aborts, zero snapshots). The return type is always the wide `Record<string, unknown>`; generic narrowing does not cascade to the return value (see the boundaries in [TS type narrowing](#ts-type-narrowing)).

## Node placement

Three placement routes, each producing exactly one undoable snapshot:

1. **Double-click empty canvas** opens the node search box (registry filtering / keyboard navigation / Enter to place — wired inside CanvasView).
2. **Sidebar drag-and-drop**: the host's sidebar item writes a structured MIME type on dragstart; the canvas auto-allows the drop and places the node at the drop point:

```js
import { setNodeDragData } from 'flowloom/svelte';
// sidebar item dragstart: writes application/x-flowloom-node-type + text/plain fallback
item.addEventListener('dragstart', (e) => {
  if (e.dataTransfer !== null) setNodeDragData(e.dataTransfer, def.typeId);
});
```

3. **Drag a link to empty canvas**: the search box opens; confirming places a new node and auto-connects a compatible port (same name preferred). Hosts may take over the drop UI themselves: `controller.onLinkEmptyDrop = (origin, at) => {...}`.

Imperative placement:

```js
controller.placeNode('step', 200, 140); // returns the new node
controller.placeNodeConnected('step', 200, 140, originPortHit); // place + connect in one step
```

Node double-click can be diverted to the host: `controller.onNodeDoubleClick = (node, screen) => openNodeDialog(node, screen)` — being set and not returning `false` takes over (the built-in rename is skipped); returning `false` falls back to the built-in inline rename. Arguments are the hit node and canvas-local screen coordinates (for anchoring overlays). The diversion covers the node body only: double-click on empty canvas and subgraph placeholders behaves as before.

## Wiring and connection validation

**Port drag-to-connect**: drag from an output port to an input port to create an edge; dragging an already-connected input port re-wires it (old edge removed, new one takes its place, one snapshot); dragging a link to empty canvas places a new node and auto-connects. Link visuals: default 3px `#64748b` (zoom-insensitive width, customizable via `--fl-link`), port dots and waypoints visible at node edges, and edges adjacent to a selected node highlight in the selection color (select a node to see its connection surface).

**Directed arrows**: a solid triangle at the edge's `to` end, screen-constant 11px (arrow size on screen never changes with zoom), color follows the edge family (type color / neutral default / selection highlight / theme-adaptive), back edges flip orientation automatically; z-order is above edge paths and below port dots (the dot caps the arrow tip — arrow enters the port).

**Connection validation** (`connectionRules`): declare which connections are legal. The ruleset is a host-side declaration: it never enters node.data / undo / semanticHash / UI format, and swapping it takes effect immediately (the props form resets on unmount). Supplying both forms ANDs them:

```js
// Registry type-compat matrix sugar: typeId-to-typeId directed map (zero boilerplate for pure-type graphs, serializable data)
controller.setConnectionRules({
  portTypeCompat: { image: ['image', 'mask'], control: ['control'] },
});
// Predicate form: dynamic logic (connection caps / cross-field / runtime state), rich endpoint payloads
controller.setConnectionRules({
  isValidConnection: (from, to) => from.node.id !== to.node.id,
});
controller.setConnectionRules(undefined); // remove (opt-out)
```

Choosing: pure-type graphs use the matrix (it only intercepts registered rows — a `from` type not in the map passes, so no full enumeration required); dynamic logic uses the predicate (arguments are `ConnectionEndpoint = { node, port, side }`; direction is always from=output side → to=input side). Same-node self-connection passes the base gate; the predicate decides (cycle semantics belong to the consumer).

Scope: three routes check, four gates never do. Checked: new-link gestures, re-wire head changes, and the auto-connect of drag-to-empty confirmations; a failed check turns the preview line red immediately (`data-fl-link-valid='false'`) and releasing silently aborts with zero snapshots. Not checked: both `applyExternal` gates (the source of truth is authoritative), direct `addEdge` (the host's own hand), undo/redo (replaying settled history), and paste (faithful reproduction, edges unfiltered). Drag-to-link preview at a locked endpoint also shows red and silently aborts — no dialogs, no toasts; the red preview is the feedback.

## Selection, copy, and undo

**Selection**: box select, Ctrl-click to add/remove, drag as a whole, Delete — all with gesture-level snapshot granularity (drag frames never enqueue; releasing commits exactly one snapshot).

**Copy-paste**: with the canvas focused, Ctrl/Cmd+C copies the selection, Ctrl/Cmd+V pastes. Ids are fully remapped, intra-set edges are kept, extra-set edges are dropped, repeated pastes offset each time, one snapshot each. The clipboard is a versioned JSON contract (unknown versions are rejected without crashing); cross-tab and cross-app paste works out of the box:

```js
const text = controller.copySelection(); // selection → contract text; undefined for empty selection
controller.paste(text); // paste (defaults to the in-page cache); bad text / unknown version is a no-op
```

**Undo/redo**: `controller.undo()` / `controller.redo()` — snapshot-style, covering every graph edit (the viewport never enters undo). Stack queries `canUndo()` / `canRedo()` always come with a subscribe notification when the stack changes, so host buttons can gray out without polling. Toolbar buttons share the same source as keybindings: `controller.commands.executeCommand('fl:undo')`.

**Multiple tabs**: one controller + component family per tab, fully isolated across graph/viewport/selection/undo (zero shared mutable module state in the library). Switching form:

```js
const registry = createNodeRegistry([...]); // read-only, shareable across tabs
const tabs = new Map(); // tabId → controller (the tab shell is host-managed)
let view;

function activate(tabId) {
  if (view !== undefined) unmount(view); // switching away: unmount the view, controller keeps full state
  let controller = tabs.get(tabId);
  if (controller === undefined) {
    controller = createCanvasController({ registry, initialGraph: createGraph() });
    tabs.set(tabId, controller);
  }
  // switching back: remounting the same controller restores graph/viewport/selection/undo
  view = mount(CanvasView, { target: panelEl, props: { controller } });
}
function close(tabId) { tabs.delete(tabId); } // closing = dropping the reference; persist per tab key
```

A resident form (multiple `CanvasView` mounted on the same page) works equally well: instances never sense each other, keybindings only fire within each canvas's focus scope; satellite components mount per tab, sharing that tab's controller.

## Groups, subgraphs, and edge paths

**Groups**: Ctrl/Cmd+G toggles grouping on the selection (if the selection is a subset of one group, that group dissolves; otherwise a group forms; memberships are exclusive, the group box = member bounding box + padding). Clicking a group box selects all members; dragging moves the whole group. Deleting members prunes; the group dies with its last member. Group data lives in the UI format's layout half and never enters semanticHash (grouping is an organization concern; revisions stay untouched):

```js
controller.toggleGroupSelection();
controller.fitGroupsToContents(); // recompute group boxes back to bounding boxes
```

**Subgraphs**: Ctrl/Cmd+Shift+E converts the selection into a nested container; edges crossing the boundary are split into "placeholder port ↔ boundary proxy" pairs (parent-side edges hang on placeholders, child-side on proxies). Double-click a placeholder to enter; breadcrumb navigation and `navigateBack()` for the way out; each container has its own viewport (LRU memory, restored on re-entry). Subgraphs live in the UI format's semantic half (conversion/content changes alter semanticHash); the clipboard never carries subgraphs:

```js
controller.convertSelectionToSubgraph(); // empty selection is a no-op
controller.enterSubgraph('fls-1', { width, height }); // size optional = fit fallback without viewport memory
controller.exitSubgraph();
controller.navigateBack();
controller.getNavPath(); // root-to-current subgraph id chain; getBreadcrumb() returns the segments
```

Deleting a placeholder kills the subgraph and all its content; deleting a boundary proxy removes its pair and the parent-side edge. Node/edge ids are globally unique across containers.

**Reroute waypoints**: click anywhere on an edge to add a waypoint in place (segmented bezier follows instantly), drag a waypoint to reshape, click a waypoint to remove it — one snapshot per action (gesture-level granularity). Waypoints live in the UI format's layout half (`layout.reroutes`, keyed by edge id) and never enter semanticHash; they die with the edge; the clipboard doesn't carry them. Purely gesture-driven, zero wiring needed in the rendering layer; headless environments feed normalized events to the same effect:

```js
controller.dispatchInput({ type: 'pointer-down', x, y, button: 0, modifiers: [] });
controller.getRerouteState(); // in-flight gesture
import { edgeWaypoints, insertReroute, hitTestEdgePath } from 'flowloom/kernel';
```

## Layout and alignment

The kernel's layout math is pure functions (zero DOM, zero registry dependencies); the imperative facade always takes exactly one snapshot, keeps the selection after layout, and re-fits affected group boxes:

```js
controller.alignSelection('left'); // six axes: left/center-x/right/top/center-y/bottom
controller.distributeSelection('horizontal'); // even spacing (first and last stay)
controller.autoLayout(); // whole-graph layered layout (simplified Sugiyama: cycle breaking / layering / barycenter ordering / origin anchoring)
controller.autoLayout({ direction: 'tb' }); // default L→R (layers advance along x); explicit back to top-bottom
controller.autoLayoutSelection(); // layout the selection (for a group domain: click the group box to select all members, then use this)
```

Layout clears the affected edges' waypoints (edges follow the new layering directly; displacement + clearing return in the same single snapshot); a no-op with nothing to clear takes zero snapshots. Default single key L (the `fl:auto-layout` command, rebindable).

## Command registry and keybindings

Commands (id + label + executable) are separated from keybindings: twenty-three built-in commands are registered with a default binding table; hosts register their own commands, rebind, inspect, and persist without touching library code. Bindings only fire within the canvas focus scope (host-global keys are never hijacked); unmatched combos fall through to the kernel interaction machines:

```js
controller.commands.register({ id: 'host:ping', label: 'Host command', run: () => {...} });
controller.commands.bind({ key: 'p', ctrl: true, alt: true, shift: false }, 'host:ping');
controller.commands.bindings(); // current binding table (a copy)
controller.commands.executeCommand('fl:undo'); // toolbar buttons share the source with keybindings
import { serializeKeyBindings, parseKeyBindings } from 'flowloom/kernel';
const revived = parseKeyBindings(serializeKeyBindings(controller.commands.bindings()));
// binding persistence = a standalone versioned document, outside the UI format, storage is host-owned;
// a bad archive parses to undefined → fall back to the default table
```

Built-in commands: `fl:undo` `fl:redo` `fl:copy` `fl:paste` `fl:delete-selection` `fl:cancel-gesture` `fl:fit-view` `fl:auto-layout` `fl:group-toggle` `fl:convert-subgraph` + the keyboard face `fl:select-next` `fl:select-prev` `fl:nudge-up/down/left/right` and the eight `*-large` variants, `fl:activate-selection` `fl:zoom-in` `fl:zoom-out`.

Default bindings: Delete / Escape / Ctrl+C·V / Ctrl+Z·Ctrl+Shift+Z·Ctrl+Y / F fit-view / L auto-layout / Ctrl+G / Ctrl+Shift+E + the keyboard face (Tab·Shift+Tab traversal / arrow-key nudge / Shift+arrow large step / Enter activate / +·=·- zoom). Delete/Escape semantics live in the kernel interaction machines; commands are their bindable aliases — unbinding falls back to the in-machine semantics.

## Accessibility (keyboard and aria)

The claim is honest and minimal: keyboard reach + core actions operable + screen-reader recognizable (interactive-accessible tier); no WCAG compliance claim, no full screen-reader narration (no aria-live announcements).

Keyboard capabilities (consumed only within the canvas focus scope, all rebindable via the command registry):

- **Traversal**: Tab/Shift+Tab walk the graph order and change the selection (single-select semantics, equal to clicking; no selection = first/last in graph order, wraps). "Selection is focus": DOM focus always stays on the canvas root (single tab stop); nodes have no second focus source.
- **Nudge**: arrow keys move the selection 1px, Shift+arrow 10px, one snapshot per effective keypress; locked nodes allow it (locks freeze existence/connections, not movement); key repeat is debounced.
- **Enter activate**: Enter on a selected node is fully equivalent to double-click (the `onNodeDoubleClick` diversion takes priority, falling back to inline rename); on a subgraph placeholder, it enters; with an empty selection, a no-op.
- **Zoom**: `+`/`=`/`-` step ×1.2 around the viewport center.
- **Pan**: space held + arrow keys pans in 50px screen steps.

The Tab default binding is a behavior change (upgrade note): with the canvas focused, Tab goes from "leave the canvas" to "traverse nodes"; hosts relying on Tab to escape can `controller.commands.unbind({ key: 'tab', ctrl: false, alt: false, shift: false })`.

aria: canvas root `role="application"` + `aria-label` + `tabindex=0`; `aria-activedescendant` follows the selection; nodes are `role="group"` + `aria-label` from the `displayNodeTitle` single source; the collapse button carries `aria-label` + `aria-expanded`. Edges carry no aria (visual-path concern); `aria-selected` is unused (illegal on a neutral container role; selection semantics are expressed solely by activedescendant). i18n: library-produced aria-labels are overridable via the optional `labels` prop:

```svelte
<CanvasView {controller} labels={{ canvas: 'Node canvas', collapseNode: 'Collapse node', expandNode: 'Expand node' }} />
```

Keyboard isolation guard (the premise of form compatibility): key events originating in control domains (on-node widgets `data-fl-widget` / satellites `data-fl-satellite`) never enter the command wiring or the dispatch loop; with the canvas focused, Tab traverses nodes, while Tab inside an input walks the host's tab order untouched.

## Presentation customization

**On-node widgets**: nodes whose registry entry declares `widgets` grow controls on the node body itself (title bar + port-label rows + widget rows, a three-band shape), dual-entry with the properties panel over the same data. A control commit = `setNodeData` with exactly one snapshot; clicking a control neither changes the selection nor starts a node drag (widget rows swallow their events); typing inside a control triggers no canvas commands. Node height/width derive from a single kernel source (title bar 24 + port rows 20×rows + widget block; nodes with widgets have a minimum width of 240); ports redistribute along the new height; group boxes, layout, and edge anchoring all consume it.

**Custom widgets for complex structures**: the five built-in kinds are flat single values; nested structures (e.g. `data.pos = {x, y}`) need the `widgetComponents` registration slot — a custom component takes over by kind, covering both the panel and the node body. Three steps: ① declare the custom kind in the registry, ② write the component, ③ pass it through the slot:

```js
// ① declare the custom kind (same namespace as built-ins; the slot takes over by name):
createNodeRegistry([{
  typeId: 'mover', label: 'Mover', inputs: [], outputs: [],
  widgets: [{ name: 'pos', kind: 'vec2', label: 'Position' }], // data.pos = { x, y }
}]);
```

② the component itself (mirrors `playground/vec2-widget.svelte`; the demo page runs it live):

```svelte
<script lang="ts">
  /** Custom widget example: nested object data (pos={x,y}, beyond the built-in five kinds)
   * taken over via the widgetComponents slot by kind='vec2'. Props contract =
   * WidgetComponentProps: value = current value of the node data key, def = the registry
   * entry, onCommit = the single commit port (the caller wires it to
   * controller.setNodeData, exactly one undoable snapshot). */
  import type { WidgetComponentProps } from 'flowloom/svelte';

  let { value, def, onCommit }: WidgetComponentProps = $props();

  /** Lenient read: uninitialized / missing keys / malformed → empty-object fallback
   * (component self-defense — no crash before the first edit writes the key). */
  const cur = $derived(
    typeof value === 'object' && value !== null
      ? (value as { x?: number; y?: number })
      : {},
  );

  /** Current axis value: missing keys read 0 (display fallback, not data backfill). */
  function axis(k: 'x' | 'y'): number {
    const v = cur[k];
    return typeof v === 'number' ? v : 0;
  }

  /** A11y label: registry label prefix + axis name (def arrives as declared; use freely). */
  function axisLabel(k: 'x' | 'y'): string {
    return `${def.label ?? def.name} ${k}`;
  }

  /** One commit per axis: legal values write the whole object (shallow-merging the pos
   * key) in exactly one undoable snapshot; empty strings / non-finite numbers are not
   * written and the control re-displays the data value (same discipline as the built-in
   * number kind — a type=number input yields '' for invalid input, and '' must be
   * rejected explicitly: Number('')===0 would write a legal-looking 0). */
  function commit(k: 'x' | 'y', e: Event & { currentTarget: HTMLInputElement }) {
    const raw = e.currentTarget.value;
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n)) {
      onCommit({ ...cur, [k]: n });
    } else {
      e.currentTarget.value = String(axis(k));
    }
  }
</script>

<div class="vec2-widget" data-fl-vec2>
  <input
    class="vec2-input"
    type="number"
    aria-label={axisLabel('x')}
    value={axis('x')}
    onchange={(e) => commit('x', e)}
  />
  <input
    class="vec2-input"
    type="number"
    aria-label={axisLabel('y')}
    value={axis('y')}
    onchange={(e) => commit('y', e)}
  />
</div>

<style>
  /* Custom components bring their own styles (the library's .fl-widget-input is a scoped
   * class of WidgetControl and never reaches host components — write the same look on the
   * same token surface: two axes side by side filling the field cell; the user-select
   * override = the canvas-wide user-select:none would kill in-input text selection). */
  .vec2-widget {
    display: flex;
    width: 100%;
    min-width: 0;
    gap: 4px;
  }
  .vec2-input {
    box-sizing: border-box;
    min-width: 0;
    flex: 1;
    padding: var(--fl-panel-space-xs, 2px) var(--fl-panel-space-sm, 5px);
    border: 1px solid var(--fl-panel-border, #e2e8f0);
    border-radius: var(--fl-panel-radius, 4px);
    font: inherit;
    color: inherit;
    background: var(--fl-panel-bg, #ffffff);
    user-select: text;
  }
  .vec2-input:focus {
    outline: 2px solid color-mix(in srgb, var(--fl-selection, #2563eb) 45%, transparent);
    outline-offset: -1px;
  }
</style>
```

```js
// ③ pass through the registration slot (same props shape for both entries):
import Vec2Widget from './Vec2Widget.svelte';
// mount(PropertiesPanel, { target: panelEl, props: { controller, widgetComponents: { vec2: Vec2Widget } } })
// mount(CanvasView, { target: el, props: { controller, widgetComponents: { vec2: Vec2Widget } } })
```

`def` arrives exactly as declared (label/min etc.), consume it or not; custom components carry their own styles (the `--fl-panel-*` token surface is open to all).

**Theme and node chrome**: the dark palette is a cool slate family (canvas base `#10131a` / node face `#1e293b`, full table in tokens.css); the selection blue family spans light and dark (`--fl-selection` light `#2563eb` / dark `#60a5fa`). Any `--fl-*` token can be overridden in host CSS (the sheet loads first; later host rules win). The category color `NodeTypeDef.color` tints the title band (color-mix with the node face, theme-adaptive).

**Node collapse**: nodes whose registry entry declares `widgets` get a chevron toggle on the left of the title bar — click to collapse to a title-bar strip (height 32, width unchanged), click again to expand. Exactly one undoable snapshot:

```js
controller.toggleNodeCollapsed(nodeId); // true = toggled; unknown node returns false, zero snapshots
```

Collapse is a pure view concern: persisted in the UI format's layout half (`layout.nodes[id].collapsed`), never in semanticHash, not carried by the clipboard (pastes expand by default). Ports redistribute along the collapsed height; group boxes, layout, and hit-testing all consume it.

**Node state display** (`nodeStates`): per-instance presentation data (live status/progress) goes straight to the rendering layer via props — zero kernel seams, zero node.data writes, zero undo/semanticHash pollution; presentation is separated from storage, the source of truth held by the host (poll or push at will). Two sub-bags with open key sets (status/priority/severity/progress/load… all work):

```js
// discrete values take the data track (selector hooks), continuous quantities the vars track
// (usable in calc/width, carrying colors/unit strings)
const nodeStates = {
  n1: { data: { status: 'running' }, vars: { progress: '42%', load: 3, tone: '#ffd500' } },
};
// mount(CanvasView, { target, props: { controller, nodeStates } })
```

Transport contract: each `data` key → a `data-fl-state-{key}` attribute on the node root; each `vars` key → an inline `--fl-state-{key}` variable on the root, nothing on descendants (host CSS uses descendant selectors from the root); key shape guard `^[A-Za-z0-9_-]+$` (illegal keys are skipped as a pair); live updates replace the bag object (fresh reference). Two structural slots (structure CSS in the library, visuals all host-side — invisible until the host styles them): the badge slot = an empty `.fl-node-badge` span at the right end of the title bar, always rendered; the progress slot = a bottom-edge `.fl-node-progress` overlay (rendered only when the `vars.progress` convention key is present) whose fill mechanically consumes `width: var(--fl-state-progress, 0)`. Both are in-box overlays with zero height — the kernel's geometry never knows:

```css
/* Host visual minimum (colors/effects are entirely host-side). Specificity note: the
   library's scoped node styles and host attribute selectors tie, and the library injects
   later — prefix host selectors with an id to win. */
#app .fl-node[data-fl-state-status='running'] { border-color: #2563eb; }
#app .fl-node[data-fl-state-status='done'] .fl-node-badge { background: #16a34a; }
#app .fl-node-progress { background: rgb(100 116 139 / 20%); }
#app .fl-node-progress-fill { background: #2563eb; transition: width 120ms linear; }
```

**Edge shapes**: four routing geometries `EdgeShape = 'bezier' | 'straight' | 'step' | 'smoothstep'`, a pure rendering-layer configuration that never enters kernel graph data/serialization. Orthogonal (step/smoothstep) is the layout language of pipeline/approval-flow/state-machine graphs. Two declaration surfaces; resolution priority = the `from` node type's registry `NodeTypeDef.edgeShape` > global default > `'bezier'`:

```js
mount(CanvasView, { target: el, props: { controller, edgeShape: 'smoothstep' } }); // global default
controller.setEdgeShape('step'); // imperative equivalent (undefined = back to bezier)
```

The four: bezier = horizontal-tangent bezier (default); straight = a two-point line (under port anchoring, back edges may cross nodes — inherent to the shape); step = an orthogonal polyline with fewest corners; smoothstep = the rounded step (corner fillets, screen-constant 6px radius). Three couplings: arrow orientation follows the last segment tangent, edge-path hit-testing follows the shape, and the drag preview follows the declared shape. Reroute waypoints are fixed must-pass corners (under polyline shapes, adjacent vertices each walk their own shape segment — what you see is what you get).

**Cross-over bridge** (`edgeJump`): a clarity device inserting a semi-circular arc "hop" on one edge where two edges cross (an engineering-drawing convention) — in densely wired graphs, where two lines intersect reads at a glance. Global switch, default `false`, a pure stylistic convention that never enters the registry, graph data, serialization, or undo:

```js
mount(CanvasView, { target: el, props: { controller, edgeJump: true } });
```

The jumping edge is the one with the greater id in lexicographic order (a stable ruling — arcs appear and disappear as crossings change while dragging, but the jumping side never flips or flickers); near-anchor crossings of same-port fan-out edges draw no arc; the arc radius is screen-constant 7px. Orthogonal to obstacle avoidance: this device handles only edge-edge crossings (no rerouting); edge-node avoidance routing is out of the library; minimap is unaffected.

## Satellite components

**Properties panel `PropertiesPanel`**: a shell-free satellite (bring your own panel container). With exactly one node selected it renders parameter controls from the registry's widget declarations; edits write data with exactly one snapshot; unregistered types / widget-less nodes fall back to read-only JSON display.

**Minimap `Minimap`**: thumbnail navigation (node rectangles + center-lines + a viewport rectangle in motion; the projection domain = content ∪ visible area, always same-frame). Click = jump, drag = follow (the camera never enters undo). No shell, no positioning (host overlay); colors via `--fl-minimap*` tokens; the switch is mount/unmount. Zero wiring: without `viewportSize` it reads the `controller.viewSize` side-channel cache (CanvasView measures its own container on mount, follows resizes via ResizeObserver):

```svelte
<Minimap {controller} /> <!-- self-measuring by default: zero wiring -->
<Minimap {controller} viewportSize={() => ({ width: canvasEl.clientWidth, height: canvasEl.clientHeight })} />
<!-- The explicit reader always overrides, for unconventional assemblies (self-managed canvas
     container measurement); the reader must really read the canvas element — a constant
     makes the viewport rectangle permanently wrong -->
```

**Selection toolbox `SelectionToolbox`**: appears when the selection is non-empty, hides during gestures; anchored above the selection's bounding box, recomputed live with the camera. Buttons = six align axes + two distribute axes (absent operations hidden: align ≥2 nodes, distribute ≥3) + group/ungroup + delete (same source as keybindings via executeCommand). The coordinate domain is the canvas container's top-left origin; mount it inside an overlay container sharing the canvas geometry.

**Context menu `ContextMenu`**: items are fully host-injected, zero library presets. The optional `CanvasView` prop `contextMenuItems` (a getItems callback as the main form + a static array sugar); not injecting opts the whole feature out (the native menu stays). Behavior: right-click selection change follows Windows rules (hitting inside the selection keeps it; hitting outside replaces; empty canvas et al. leave the selection alone; ctrl+right-click merges in); no popup during gestures; the SelectionToolbox yields while the menu is open; Esc closes only the menu. Item shape `{ label, shortcut?, disabled?, items?(recursive submenu), run? }`, null = separator:

```js
mount(CanvasView, {
  target: el,
  props: {
    controller,
    contextMenuItems: (context) =>
      context.kind === 'node'
        ? [{ label: 'Start', run: () => dispatch(context.nodeId) }, null, { label: 'Delete', disabled: true }]
        : [{ label: 'Auto layout', shortcut: 'L', run: () => controller.autoLayout() }],
  },
});
```

Headless equivalent: `controller.dispatchInput({ type: 'contextmenu', x, y, modifiers: [] })`; `getContextMenuState()` reads the open state, `closeContextMenu()` closes it.

**Title editing**: double-click a node title to rename in place (Enter/blur commits, Escape cancels, one snapshot; wired inside CanvasView). Custom titles live in the node data reserved key `fl:title` (display-name fallback chain = custom > registry label > typeId) and travel with the clipboard; hovering a node shows a tooltip (display name + typeId).

## External data sources and AI agent integration

A canvas mirroring an external source of truth (file / database / polling / event stream / AI agent output) is a first-class flowloom scenario.

**Silent external ingestion**: external writes go through `controller.applyExternal(changes)` (changeset · primitive) or `controller.applyExternalGraph(graph)` (whole graph · sugar; alias `applyGraph`). External changes are not user actions: **always zero snapshots, never occupying history slots** — but the gate first re-anchors the snapshot stacks (every history cell in both undo/redo piles gets the same change re-applied), so external changes always survive undo/redo, and undo strictly rolls back user operations only. Choose the gate by source completeness: state sources (perceive changes by re-reading everything) take the whole-graph gate; stream sources (naturally incremental) take the changeset gate; throttling lives at the gate (the host coalesces into one call; one call notifies at most once):

```js
// State source (poll, re-read everything) — "not on the ledger = deleted":
// sets you don't mirror must be passed explicitly as []:
controller.applyGraph({
  nodes: [
    { id: 'T-101', typeId: 'ticket', data: { title: 'Fix login', state: 'done' } },
    { id: 'T-102', typeId: 'ticket', data: { title: 'Follow-up' } },
  ],
  edges: [{ id: 'e1', from: { nodeId: 'T-101', portId: 'out' }, to: { nodeId: 'T-102', portId: 'in' } }],
  groups: [],
});

// Stream source (event increments) — the host coalesces into one envelope per delivery:
controller.applyExternal({
  nodes: {
    upsert: [{ id: 'T-103', typeId: 'ticket', near: 'T-102', data: { title: 'Follow-up' } }],
    remove: ['T-101'],
  },
});
```

Field policy (externals write semantics, not craft): node data is replaced wholesale (defaulting to `{}`; canvas hand-edits being overwritten by the next sync is exactly mirror semantics); typeId/geometry-view fields (x/y/width/height/collapse) are never written on existing nodes (re-typing = remove+add, two envelopes); edges are connectable-writable, waypoint-not; group membership lists are writable, box geometry automatic. New-node placement takes a three-step ladder: ① x/y in the envelope are used as-is → ② the `near` hint (one step right of the anchor, vertically centered, stepping +x when occupied) → ③ deterministic default (one step right of the content bounding box, vertically centered; origin on an empty graph; the same state and envelope always replay to the same spot). Three-state preservation: the camera doesn't move; the selection prunes; an in-flight drag colliding with ingestion is harmlessly wasted. The domain is the root container; malformed envelopes throw loudly naming the field, with zero side effects.

State and structure, two seams: state goes through the `nodeStates` prop (live, zero pollution); structure goes through this gate — split one source-of-truth dataset into two envelopes.

**Structural locks** (`nodeLocks`): "the future can be rearranged; the past is untouchable" — a locked node's structural half (existence + edge connections) is frozen, while the layout half (move / box-drag / group / collapse) stays free. The lockset is a host-side declaration: never in node.data/undo/semanticHash, never flushed by applyExternal, effective immediately on swap (props form and `setNodeLocks()` are equivalent dual entries):

```js
// Predicate form: policy-derived — locks never persist, derived from host data fields
// (done means locked; no second roster to maintain)
mount(CanvasView, { target, props: { controller, nodeLocks: { predicate: (n) => n.data.status === 'done' } } });
// Id-set sugar: a state snapshot — the lock list comes from established facts elsewhere
// (both Set and array accepted)
controller.setNodeLocks({ ids: ['t27', 't31'] });
// Both forms supplied = union; remove with controller.setNodeLocks(undefined)
```

What locks lock: locked nodes can't be deleted or wired/unwired; edges on them are frozen whole; Delete on a mixed selection filters (deleting only the editable part); copy is allowed, cut = host-composed copy + Delete; paste products always carry fresh ids (the id-set form never locks them; the predicate form derives naturally from cloned data); subgraph conversion containing a locked node is a whole-envelope no-op; the auto-connect of drag-to-empty respects the lockset. Dual to external ingestion: locks intercept user gestures and canvas commands on the canvas; the external gates don't check them (the source of truth freely mutates locked nodes), and the host's direct imperative APIs don't either. A fully read-only canvas is the degenerate always-true predicate (`predicate: () => true`).

**Host reactive wiring**: host UIs (sidebars/inspectors) following "the current selection" use the read-only store `createSelectionStore(controller)` (a `svelte/store` readable in a plain `.ts` module), consumed directly as `$selection`:

```js
import { createSelectionStore } from 'flowloom/svelte';

const selection = createSelectionStore(controller); // value = array of selected node objects (graph order)
// In Svelte host templates use $selection directly (subscribe/unsubscribe automatic);
// non-reactive contexts: controller.getSelectedNodes() in one step
```

Contract: the subscription source is controller.subscribe — no second source of truth (the store is a projection, not a copy); element-level emission debouncing (immutable value semantics: an unchanged node keeps its reference; viewport pans and graph changes not involving the selection emit nothing); read-only discipline = `subscribe` only. Sharing the same controller with PropertiesPanel: panel edits commit one snapshot, the sidebar sees the new data through the store simultaneously; deleting the selected node prunes the selection and emits the new value without dangling.

**Teachable errors**: public-gate throw messages carry three elements (cause + legal options + recovery verb) — runtime documentation written for agents. Feeding a wrong shape (e.g. pouring a `getState()` product straight back into the whole-graph gate) yields an error naming the field and the way out, not a silent no-op. Known graph-state keys (subgraphs/selection/version/semantic/layout/viewport) get targeted hints (suspected graph-state shape → strip machine fields via projection / pass unmirrored sets explicitly as [] / switch incremental sources to the changeset gate).

## Persistence

The UI format (semantic + layout + viewport as one) is the only persistence shape; storage is host-owned (the library binds no medium):

```js
import { fromUiFormat } from 'flowloom/kernel';

// Save: project the whole thing on every change (one key, one JSON)
controller.subscribe(() => localStorage.setItem(KEY, JSON.stringify(controller.toUiFormat())));
// Load (reopen assembly):
const ui = JSON.parse(localStorage.getItem(KEY));
const canvas = createCanvasController({
  registry,
  initialGraph: fromUiFormat(ui),
  initialViewport: ui.viewport,
});
// Bad archives don't explode: fromUiFormat throws fail-loud on unknown versions;
// the host catches and starts a fresh graph
```

`semanticHash(ui)` never changes with layout/viewport adjustments — revision detection is immune to dragging and zooming (mechanically locked by tests).

## PNG·SVG export

Export the whole graph as a self-contained SVG string / PNG Blob (reports/archival/document embedding). Data-exit facade methods (zero snapshots, zero notifications):

```js
const svg = controller.exportSVG(); // self-contained SVG string (fully headless — pure string assembly)
const png = await controller.exportPNG({ pixelRatio: 2 }); // image/png Blob (needs a DOM rasterization environment)
// options: { theme?: 'light' | 'dark', background?: string | 'transparent', pixelRatio?: number (PNG-only, default 1) }
```

Self-containment: color values are literalized (both theme sheets ship with the library; category tint bands pre-mixed into rgba literals); fonts declare `system-ui`/`ui-monospace` inline without embedding font files. The domain is uniquely the whole graph (nodes ∪ group boxes ∪ edge waypoints + margin); zero filtering (to export a subgraph: build it first, then export). The theme default comes from the `controller.exportEnv` side-channel slot (CanvasView reads `data-fl-theme`/`prefers-color-scheme` on mount and mirrors the publication — state tinting is WYSIWYG); exporting both themes = two calls passing `theme`.

Fidelity (WYSIWYG chrome follows, interaction state doesn't): followed = category tint bands / the four state conventions (`status` keys `todo`/`running`/`done`/`error` band colors, `vars.progress` progress bar) / the lock glyph (🔒) / collapse shape / the four edge shapes / node title + widget value text (built-ins formatted by kind; custom kinds degrade to short value-JSON text); not carried = selection highlights / box selection / hover / drag previews / waypoint edit states (a clean archive, not an interaction snapshot). `exportPNG` throws fail-loud in headless environments; `exportSVG` works fully headless.

Delivery = returned products, no download triggered (downloading is host UX, one line of wiring):

```js
const blob = await controller.exportPNG({ theme: 'dark' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'canvas.png'; // SVG side: a.href = 'data:image/svg+xml,' + encodeURIComponent(svg)
a.click();
URL.revokeObjectURL(a.href);
```

Boundaries: the type-color families `--fl-port-*`/`--fl-link-*` (host CSS open set) export as neutral colors (host-custom colors don't enter exports); cross-over bridge arcs don't export (a pure stylistic device); the four state bands are export-side fixed colors (no host CSS to carry); text overflow clips at the node rectangle; `background` must be a legal CSS color; the theme slot is read at publication time (passing `theme` explicitly always works); in-viewport clipping / selection filtering / JPEG are out of the library.

## TS type narrowing

A pure type-level public API (generic parameters fully erased, zero runtime change; the default is the existing wide shape — existing code needs nothing). The host declares a "typeId → data shape" map; `FlowloomNode<AppData>` distributes it into a discriminated union — at `node.typeId === 'phase'`, TypeScript narrows data to PhaseData:

```ts
import { createNodeRegistry, type FlowloomNode } from 'flowloom/kernel';
import { createCanvasController, createSelectionStore } from 'flowloom/svelte';

type PhaseData = { title: string; done: boolean }; // type aliases recommended for data shapes (see boundary below)
type ImageData = { path: string; scale: number };
type AppData = { phase: PhaseData; image: ImageData };
type AppNode = FlowloomNode<AppData>; // = CanvasNode<PhaseData,'phase'> | CanvasNode<ImageData,'image'>

const registry = createNodeRegistry<AppData>([
  // Registry drift lock: typeIds are compile-time constrained to the map keys ('bogus' errors)
  { typeId: 'phase', label: 'Phase', inputs: [], outputs: [{ portId: 'out', label: 'Out' }] },
  { typeId: 'image', label: 'Image', inputs: [{ portId: 'in', label: 'In' }], outputs: [] },
]);
const controller = createCanvasController<AppNode>({ registry }); // generic slot (default = wide shape, zero change)

for (const node of controller.getSelectedNodes()) {
  if (node.typeId === 'phase') console.log(node.data.title); // data narrowed: title is string
}
const selection = createSelectionStore(controller); // TNode inferred from the controller — the value stream is AppNode[]
```

Narrowing lands on five read/placement methods: `getSelectedNodes(): TNode[]`, `placeNode(typeId: TNode['typeId'], …): TNode`, `placeNodeConnected(…)`, `addNode(node: TNode)`, `setNodeData(id, patch: Partial<TNode['data']>)` (out-of-registry keys / wrong-typed values rejected at compile time). Registry-first hosts lock the reverse direction with satisfies:

```ts
import type { NodeTypeDef } from 'flowloom/kernel';

const defs = [
  { typeId: 'phase', label: 'Phase', inputs: [], outputs: [] },
  { typeId: 'image', label: 'Image', inputs: [], outputs: [] },
] satisfies readonly (NodeTypeDef & { typeId: keyof AppData })[]; // 'bogus' errors here
```

Boundaries (recorded as-is): `getState()`/`toUiFormat()` stay wide (graph-state/serialization never cascades generics); callback properties (`onNodeDoubleClick` etc.) stay wide `CanvasNode` (assert `node as AppNode` inside before discriminating); TNode is a host assertion, not a runtime check — without a registry `initialData`, placed data is always `{}`; declare an `initialData` factory or make the map's shapes fully optional. Prefer type aliases for data shapes (interfaces lack implicit index signatures and get blocked at "narrow controller to wide consumer" Record boundaries — a known TS behavior).

## Headless kernel

The kernel is pure TypeScript with zero DOM dependencies: the full interaction logic runs in Node (the tests do exactly this).

```js
controller.dispatchInput({ type: 'wheel', x: 120, y: 60, deltaY: -100, modifiers: [] }); // pointer-anchored zoom
controller.fitView(width, height); // fit the whole graph (with margin); the viewport never enters undo
import { hitTestNode, hitTestPort, screenToGraph } from 'flowloom/kernel'; // geometry/hit pure functions
```

## API reference

The full public surface of controller and CanvasView props (verified against the code — don't guess names from memory: in JS a missing method is a bare TypeError no error machinery can intercept before the call). TS signatures live in `controller-types.ts` and [TS type narrowing](#ts-type-narrowing).

**Controller properties** (4 read-only + 2 settable hooks):

| Property | Meaning |
|---|---|
| `registry` | the node registry (constructor-injected) |
| `commands` | command registry face: built-ins + bind/unbind/executeCommand/bindings |
| `viewSize` | view-size side-channel slot (published by CanvasView on mount) |
| `exportEnv` | export-environment side-channel slot (theme + state bags) |
| `onLinkEmptyDrop` | link-dragged-to-empty hook (settable) |
| `onNodeDoubleClick` | node-double-click diversion hook (settable; returning false falls back to built-in rename) |

**Controller methods** (grouped by topic):

| Topic | Methods |
|---|---|
| Read state | `getState()` / `getViewport()` / `getViewportMachineState()` / `getSelectionState()` / `getSelectedNodes()` / `getLinkState()` / `getRerouteState()` / `getContextMenuState()` / `getNavPath()` / `getBreadcrumb()` / `canUndo()` `canRedo()` / `toUiFormat()` |
| Subscribe | `subscribe(listener) → unsubscribe fn` |
| Graph writes (exactly one snapshot) | `addNode(node)` / `removeNode(id)` / `addEdge(edge)` / `moveNode(id,x,y)` / `setNodeData(id,patch)` / `toggleNodeCollapsed(id)` |
| Placement | `placeNode(typeId,x,y)` / `placeNodeConnected(typeId,x,y,origin)` (seeded when registry `initialData` is present) |
| External ingestion (always zero snapshots) | `applyExternal(changes)` changeset primary name / `applyExternalGraph(graph)` whole-graph primary name / `applyGraph(graph)` whole-graph alias (≡applyExternalGraph) |
| Clipboard | `copySelection()` / `paste(text?)` |
| Groups & layout | `toggleGroupSelection()` / `fitGroupsToContents()` / `alignSelection(axis)` / `distributeSelection(axis)` / `autoLayout(options?)` / `autoLayoutSelection(options?)` |
| Subgraphs | `convertSelectionToSubgraph()` / `enterSubgraph(id,fitSize?)` / `exitSubgraph(fitSize?)` / `navigateTo(path,fitSize?)` / `navigateBack()` |
| Viewport (never in undo) | `setViewport(viewport)` / `fitView(width,height,margin?)` |
| Input | `dispatchInput(event)` (normalized event, direct feed for headless) |
| Side declarations (zero snapshots, zero notifications) | `setNodeLocks(locks?)` / `setConnectionRules(rules?)` / `setEdgeShape(shape?)` |
| History | `undo()` / `redo()` |
| Context menu | `closeContextMenu()` |
| Export | `exportSVG(options?) → string` / `exportPNG(options?) → Promise<Blob>` |

**CanvasView props** (`controller` required, all others optional):

| Prop | Meaning |
|---|---|
| `controller` | a controller instance (one per canvas) |
| `widgetComponents` | custom widget registration slot |
| `contextMenuItems` | context menu items injection (not injected = opt-out, native menu) |
| `nodeStates` | node state bags |
| `nodeLocks` | structural lockset |
| `connectionRules` | connection validation ruleset |
| `edgeShape` | edge-shape global default |
| `edgeJump` | cross-over bridge switch |
| `labels` | library-produced aria-label overrides |

### Consumption guides

**Execution-state tinting** (run replay / execution feedback): the `nodeStates` prop reaches the rendering layer directly; open-set keys (`^[A-Za-z0-9_-]+$`) land as `data-fl-state-{key}` attributes plus `--fl-state-{key}` inline variables on the node root — the host stylesheet colors by attribute selectors, effects via keyframes:

```svelte
<CanvasView {controller} nodeStates={states} />
```

```js
// states: Record<nodeId, { data: key-value bag, vars: key-value bag }> — live updates replace the bag object
const states = { [nodeId]: { data: { status: 'running' }, vars: { progress: 0.4 } } };
```

```css
/* Host stylesheet (file-level — do not write inside a Svelte component <style>, see the
   note at the end of this section) */
.fl-node[data-fl-state-status='running'] { border-color: var(--fl-selection); }
.fl-node[data-fl-state-status='error'] { border-color: #ef4444; }
.fl-node[data-fl-state-status='running'] .fl-node-badge { animation: fl-pulse 1.2s infinite; }
@keyframes fl-pulse { 50% { opacity: 0.35; } }
```

**The `data-fl-node` deterministic selector** (per-node-id tinting/highlighting/dual-canvas isolation): the node root always carries `data-fl-node="{id}"` (stable, mount-independent). Select nodes by id with `[data-fl-node="n1"]`; isolate same-page dual canvases by container scope (`.canvas-a [data-fl-node="n1"]`). Note the DOM `id` attribute carries a per-mount random prefix (`fl-{random6}-{nodeId}`, the a11y `aria-activedescendant` anti-collision design), and `idPrefix` is not a public prop: never use DOM ids as selectors — `data-fl-node` is the stable selection surface.

**Port hit-zone geometry** (the measured recipe for automated tests / Playwright drags): hitting is coordinate-based — the port dot is SVG (`pointer-events:none`), the port label doesn't respond; dragging the label center does nothing. Expanded-state anchor formula (kernel `portPositions` single source): input ports x = node left edge, output ports x = node right edge, y = `node.y + 24 (title bar) + i×20 (row height) + 10 (row center)` — the first row is `y+34`; hit radius 8px (screen coordinates). Collapsed ports distribute `(i+1)/(n+1)` along the collapsed strip. Compute coordinates with the kernel pure functions, not pixel formulas: `import { portPositions, nodeSize } from 'flowloom/kernel'`, or judge hits directly with `hitTestPort`.

**subscribe teardown** (Svelte hosts, leak-proofing): subscribe inside `$effect` and return the unsubscribe function — component unmount cleans up automatically; for "current selection" following, use `createSelectionStore` (no manual teardown):

```svelte
<script>
  $effect(() => {
    const off = controller.subscribe(() => {
      /* follow graph changes (read getState etc.) */
    });
    return off; // cleanup fn = unsubscribe
  });
</script>
```

**Host integration note — a Svelte template `<style>` is a raw-text context**: CSS literals containing `</script>` or `<` make svelte-check report mispositioned errors. Dynamic styles (runtime-assembled keyframes etc.) go through DOM `createElement('style')` injection or a host global stylesheet — never string-build inside a component `<style>`.

## Local demo pages

`npm run play` starts the playground (vite, port 5199); `playground/hub.html` is the tour hub (full capability list with direct links + light/dark linkage). What each page demonstrates:

| Page | Demonstrates |
|---|---|
| `index.html` | main drill: the eight basic capabilities lit one by one |
| `hub.html` | tour hub: full capability navigation + nested three-lens deep links |
| `nested.html` | nested subgraphs: conversion / boundary proxies / breadcrumb navigation |
| `layout.html` | data-driven layout: coordinate-free declaration → auto layout + readability readouts |
| `widgets.html` | on-node widgets: three-band shape + width-policy comparison |
| `theme.html` | theme and node chrome: light/dark switching + title-band tint, three tiers |
| `contextmenu.html` | context menu: five hit paths + selection-change modes + yielding |
| `dblclick.html` | the double-click diversion hook |
| `status.html` | node state display: dual-track passthrough / structural slots / live graph, compared |
| `arrows.html` | directed arrows: screen-constant + back-edge flipping |
| `locks.html` | structural locks: predicate / id-set / unlocked, three tiers |
| `integration.html` | integration demo I: six faces on one canvas (context menu / diversion / state / ingestion / arrows / locks) |
| `selection.html` | host reactive wiring: $selection sidebar following + emission discipline |
| `custom-widget.html` | custom widgets for complex structures: register → render → edit write-back |
| `a11y.html` | the a11y keyboard face + aria readouts |
| `edge-shapes.html` | the four edge shapes compared + registry per-type override |
| `edge-jump.html` | cross-over bridges: crossing arcs + switch comparison |
| `connection-rules.html` | connection validation: matrix example + predicate example + readouts |
| `export.html` | PNG·SVG export: both themes + transparent background + pixelRatio |
| `dist.html` | the dist distribution face: a whole page importing via the dist entry |
| `integration2.html` | integration demo II: an approval flow, six faces on one canvas (the README screenshots) |

## dist entry and source consumption

The library is not yet published to npm (`private: true`); the official private distribution channel is the prebuilt `dist` committed in-repo. The `exports` map has two faces:

- **Source four keys** `flowloom` / `flowloom/kernel` / `flowloom/svelte` / `flowloom/tokens.css` → the `./src` tree (consumed directly by this repo's playground and tests).
- **dist four sub-keys** `flowloom/dist` / `flowloom/dist/kernel` / `flowloom/dist/svelte` / `flowloom/dist/tokens.css` → the committed artifacts.

The artifacts are three single-file ESM bundles (one per entry) plus tokens.css as-is (`dist/{index,kernel,svelte}.js`): all `.svelte`/TS pre-compiled, component css `'injected'` (self-contained JS, zero CSS files), `svelte` always external (the peerDependency is host-supplied). **Why prefer dist**: the artifacts are pure browser ESM — the host build pipeline needs zero Svelte compilation knowledge; the externalized specifier means a single instance, naturally immune to "dual Svelte runtime" host pitfalls. Consumption = copy the four dist files + keep the `svelte` specifier external (or vendor-rewrite to a host-supplied path); rebuild = `npm run dist:build` (on every version bump). v1 ships no .d.ts: TS hosts use the source keys for types.

Three commonly missed host items:

1. **Container sizes are host-fed everywhere (except Minimap)**: kernel/controller is headless, zero DOM — `fitView(width, height)` for whole-graph fitting and `enterSubgraph(id, { width, height })` as the fallback without viewport memory are host-fed; Minimap self-measures when `viewportSize` isn't passed (an explicit reader always overrides — and must really read the canvas element; a constant leaves the viewport rectangle permanently wrong).
2. **tokens.css import and `data-fl-theme`**: dist path = `<flowloom>/dist/tokens.css` (source path = `src/svelte/tokens.css`) + the theme attribute on `<html>`. Pipelines without a CSS import channel (e.g. browser extensions) inject it themselves.
3. **The source fallback path — `.svelte.[tj]s` runes modules must pass the Svelte compiler**: the in-package `src/svelte/{placement,hover-tooltip,title-edit}.svelte.ts` modules use `$state` and other runes; esbuild/swc default TS transpilation leaves bare `$state` calls, which crash at runtime with `ReferenceError: $state is not defined` (component render dies; zero hint from the library — every source consumer hits this; the dist path is pre-compiled and immune). The fix is a two-track onLoad in the build pipeline: `.svelte` components go through `compile`; `.svelte.[tj]s` strips TS first, then `compileModule`:

```js
// esbuild onLoad two-track (esbuild-wasm in plugin environments; esbuild in Node builds, same API):
import fs from 'node:fs';

function svelteLoader() {
  return {
    name: 'flowloom-svelte',
    setup(build) {
      // .svelte components: compile (css:'injected' — scoped styles injected at runtime)
      build.onLoad({ filter: /\.svelte$/ }, async (args) => {
        const compiler = await import('svelte/compiler');
        const source = fs.readFileSync(args.path, 'utf8');
        const result = compiler.compile(source, { generate: 'client', dev: false, css: 'injected' });
        return { contents: result.js.code, loader: 'js' };
      });
      // runes modules .svelte.ts/.svelte.js: strip TS → compileModule (bare $state crashes at runtime)
      build.onLoad({ filter: /\.svelte\.[tj]s$/ }, async (args) => {
        const compiler = await import('svelte/compiler');
        const { transform } = await import('esbuild-wasm');
        const source = fs.readFileSync(args.path, 'utf8');
        const loader = args.path.endsWith('.ts') ? 'ts' : 'js';
        const stripped = (await transform(source, { loader, format: 'esm' })).code;
        const result = compiler.compileModule(stripped, { generate: 'client' });
        return { contents: result.js.code, loader: 'js' };
      });
    },
  };
}
// One bundle per entry (same face as exports; svelte external — the host supplies the single runtime):
// entryPoints: ['<flowloom-src>/src/index.ts', '<flowloom-src>/src/kernel/index.ts',
//               '<flowloom-src>/src/svelte/index.ts'],
// bundle: true, format: 'esm', external: ['svelte', 'svelte/*'], plugins: [svelteLoader()]
```
