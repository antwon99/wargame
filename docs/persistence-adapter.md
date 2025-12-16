# Persistence adapters

The persistence layer now supports pluggable storage adapters so local saves can be redirected
to remote or mocked stores without rewriting serialization logic.

## Adapter surface

Adapters are expected to expose four synchronous functions:

- `getItem(key)`
- `setItem(key, value)`
- `removeItem(key)`
- `keys()` (returns an array of available keys)

Use `Persistence.createStorageAdapter(storageLike)` to wrap an existing storage provider (such as
`localStorage`, a Map-backed cache, or a remote shim), or supply a full adapter that already matches
this surface.

## Swapping adapters

Call `Persistence.setStorageAdapter(adapterOrStorage)` to switch the active adapter. Passing a
storage-like object will automatically be wrapped in the adapter interface; providing a fully shaped
adapter leaves it untouched. The active adapter can be inspected with `Persistence.getStorageAdapter()`.

## Pure snapshot helpers

The serialisation and deserialisation helpers remain pure and storage-agnostic. Consumers that only
need to transform data can call `Persistence.SnapshotSerializer.serialize(game, options)` and
`Persistence.SnapshotSerializer.deserialize(snapshot, options)` directly without touching the active
adapter. Stat clamping utilities also live under `Persistence.StatHelpers` for reuse by remote
persistence clients.
