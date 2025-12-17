# Campaign Store

The campaign store centralizes save/load/reset flows so UI code and gameplay state
only communicate through the serializable snapshot surface (`getSnapshot`/`applySnapshot`).
It wraps `Persistence` with injectable callbacks for HUD updates, toast feedback, and
world reset hooks. Tests can supply mock persistence adapters and stubs for UI handlers
to exercise persistence behavior without instantiating the entire `Game` singleton.
