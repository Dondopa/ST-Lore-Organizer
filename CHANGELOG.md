# Changelog

## 0.1.3

- Added per-group **Select All / Deselect All** controls while Bulk Select mode is active.
- Group selection affects only lorebooks directly assigned to that group, not nested subgroups.
- Added matching Select All / Deselect All control for Ungrouped lorebooks.
- Selected books can then be mass-moved using the existing bulk destination control.

All notable changes to Lore Organizer will be documented here.

## 0.1.2 - 2026-09-04

### Added
- Bulk Select mode for moving many lorebooks into a group at once.
- `Select visible` action, designed to work with the existing search filter.
- Bulk move destination picker supporting any nested group or Ungrouped.
- Selected-item count, Clear, and Done controls.
- Bulk selection works for lorebooks whether currently grouped or ungrouped.
- Desktop drag-and-drop is temporarily disabled while Bulk Select mode is active to avoid accidental moves.

## 0.1.1 - 2026-09-04

### Fixed
- Global lorebook activation/deactivation now drives SillyTavern's native `#world_info` selector and normal change handler.
- Group On/Off and presets now apply activation changes in one native selection update instead of repeated slash-style calls.
- Organizer checkbox state now shares the same source of truth as SillyTavern Global Lore.

## [0.1.0] - 2026-09-04

### Added
- Nested lorebook groups/folders.
- Global lorebook activation toggles using SillyTavern's native World Info activation path.
- Recursive enable/disable controls for groups.
- Search across groups and lorebooks.
- Desktop drag-and-drop assignment.
- Mobile-friendly "Move to group" selector.
- Activation presets that can save, apply, and delete sets of globally active lorebooks.
- Organizer metadata stored separately in `extension_settings.lore_organizer`.
- No modification of native lorebook JSON files.