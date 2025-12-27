# Architecture layout

This map highlights the top-level `scripts/` domains and the responsibility boundaries they own.

## `scripts/` directory map

- `scripts/mandates/`: Imperial Mandates runtime (calendar helpers, core state machine, adapters, manager, and registry).
- `scripts/overworld/`: Overworld-specific logic (tiles, adjacency, rendering, tick cadence, and map state).
- `scripts/ui/`: UI orchestration (bindings, overlays, notifications, and HUD helpers).
- `scripts/persistence/`: Save/load, serialization, and data migration helpers.
- `scripts/audio/`: Audio routing, configuration, and ambient orchestration.

When adding new modules, place them in the closest domain folder and keep cross-domain calls flowing through the public entry points listed above.
