# Tutorial Callouts

The tutorial callout helper anchors lightweight narrative prompts to specific overworld tiles without blocking the map. It powers the introductory Imperial Decree and can be reused for future hints (research unlocks, tile selection tutorials, etc.).

## API

Provided by `scripts/tutorialCallouts.js`:

- `showTileCallout(game, tile, options)`
  - `title`: heading text.
  - `body`: HTML-supported body copy.
  - `buttonText`: label for the acknowledgement button.
  - `onConfirm`: callback fired after the player clicks the button.
- `hideTileCallout()` removes any active callout.

Both functions are exposed on `window.TutorialCallouts` and bound onto the `Game` object via `applyUIBindings`.

## Placement behavior

- The helper attempts to anchor to a DOM element on the tile (when present), otherwise it uses `game.projectHexToScreen(tile)` to infer screen space.
- The callout prefers to render above the tile; when vertical space is limited it moves below and draws a thin connector line to the hex.
- A short fade-in/fade-out transition keeps the prompt readable without blocking gameplay.

## Usage example

```js
TutorialCallouts.showTileCallout(game, rebelTile, {
    title: 'By Imperial Decree:',
    body: 'Secure the frontier before the rebels rally.',
    buttonText: 'Understood',
    onConfirm: () => TutorialCallouts.hideTileCallout()
});
```
