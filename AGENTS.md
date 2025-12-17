# AGENTS.md for Wargame
This file provides Codex with a complete understanding of how to interact with the Wargame project. Codex should use this document as its operating manual for building features, fixing bugs, and maintaining a coherent structure.

## General Guidelines
-   **Code Style:** Adhere to the project's ESLint and Prettier configurations.
-   **Documentation:** All public functions, classes, and components require detailed comments.
-   **Testing:** New features and bug fixes must include corresponding unit and integration tests.
-   **Commit Messages:** Follow Conventional Commits specification.

## Testing Instructions
-   Ensure **all** tests pass before merging branches.
-   Ensure tests **actually do something** (not just placeholders that automatically pass)

## Documentation and Observability
-   Codex should prioritize **clarity of system behavior.**  
-   All non-trivial features must be accompanied by in-code comments or API-accessible diagnostics that explain their purpose and behavior.  
-   When creating new systems, include a brief description of their logic and thresholds, especially if tied to gameplay feedback (e.g. hallucinations, spiral triggers, sanity modifiers), **and create an accompanying doc file in `/docs/`.**

## Branches
-   Most iteration will be done on the `moonshots` branch.
-   The `main` branch is the main, stable version that `moonshots` (if they work) eventually merges with.
-   The `main(backup)` (if it exists) is usually a version 1-2 updates before `main` branch to isolate and fix any lingering bugs.
-   The `OGmain` is a nuclear-level backup containing nothing. (Back to the very beginning, just in case.)
-   That's my personal naming convention, if those files don't exist yet, you're just early. Any new branches will be documented as/if they come.

-   ## Architectural Guardrails (Non-Negotiable)

### No Responsibility Creep
Do not add new logic to large or legacy modules unless explicitly instructed.

If a file already:
- exceeds ~300 lines, or
- handles multiple concerns (e.g. state + UI + persistence),

then **new functionality must go into a new dedicated module**.

### Wrapper First, Refactor Later
When extracting or reorganizing systems:
- First create a thin wrapper module that preserves existing behavior.
- Route callers through the wrapper.
- Only then move internal logic behind the wrapper.

Do not redesign schemas, rename fields, or “clean up” while extracting.

### One System Per File
Each module should represent a single system or concern:
- persistence store
- mandate registry
- mandate evaluator
- audio engine
- UI binding layer
- simulation logic

If a change touches more than one concern, stop and split it.

### Prefer Additive Changes
Prefer adding new modules and adapters over modifying existing ones.
Avoid touching stable systems unless required to wire in the new module.

If unsure, ask before refactoring.



## Final Principles
-   Stick to the `README.md` and `AGENTS.md` files, and ultimately its vision and end goals.
-   Always explain fixes in plain English unless explicitly told not too.
