# ST-Lore-Organizer

A frontend-only SillyTavern extension for organizing large collections of native lorebooks without merging or rewriting them.

Lore Organizer adds a separate hierarchy above SillyTavern World Info / lorebooks. Your actual lorebook JSON files stay native and unchanged.

## Features

### Nested groups
Create any hierarchy you want, for example:

```text
Eostia Universe
├── Setting
│   ├── Albion
│   └── Terranovia
├── Characters
└── Systems
```

Groups are organizational metadata only.

### Native Global Lore activation
The checkbox beside a lorebook controls SillyTavern's real native Global Lore selection. Group **On** and **Off** operate on the whole group tree.

**Only** replaces the current native Global Lore set with the selected group tree (plus dependencies when dependency activation is enabled).

### Aliases / multiple placements
One native lorebook can appear in several organizer groups without copying the lorebook.

Use the `⋯` button beside a lorebook to manage all of its group placements. A small `+N` badge shows extra placements.

### Dependencies
A lorebook can declare other lorebooks that should activate with it. Dependencies are organizer metadata; they are not written into lorebook JSON.

- Enable a dependent lorebook -> its dependencies also enable.
- Dependencies can themselves have dependencies.
- Disable a lorebook -> dependencies are left alone, because another active lorebook may still need them.
- Dependency activation can be disabled globally with **Auto-activate dependencies**.

### Bulk organization
Bulk Select supports:

- Select visible
- Select active
- Select inactive
- Invert
- Per-group Select All / Deselect All
- Move selected to another group
- Alias selected into an additional group

### Group movement
Groups can be reparented with the `↪` action. On desktop, groups can also be dragged onto another group to nest them.

### Collapsed-state memory
Group collapse state and the Ungrouped collapse state persist across reloads. Ungrouped is collapsed automatically when upgrading an already-organized library to v0.2.

### Presets
Save the current native Global Lore selection as a named preset and restore it later.

### Backup / Restore
**Backup** downloads the complete Lore Organizer metadata as JSON:

- groups
- aliases/placements
- presets
- collapse state
- dependencies
- organizer settings

**Restore** imports a previous organizer backup. Native lorebooks are never replaced by this process.

### Orphan cleanup
If a lorebook has been renamed/deleted and organizer metadata still references it, Lore Organizer shows a warning and can clean the stale references.

## Installation

In SillyTavern, open the Extensions installer and install from:

```text
https://github.com/Dondopa/ST-Lore-Organizer
```

Reload SillyTavern after installation if necessary.

## Updating

The manifest uses the repository as its `homePage` and has automatic update support enabled. You can also use SillyTavern's extension update action manually.

## Data model

Lore Organizer stores its state in SillyTavern extension settings under:

```text
extension_settings.lore_organizer
```

It does **not** add organizer metadata to native lorebook JSON files.

Starting with v0.2, each lorebook can have multiple group placements. Existing v0.1.x single-group assignments are migrated automatically.

## Design principle

Lore Organizer is intentionally not a World Info entry editor. SillyTavern continues to own lorebook contents and triggering behavior. This extension focuses on organizing, navigating, activating, grouping, aliasing, and relating lorebooks.

## License

MIT
