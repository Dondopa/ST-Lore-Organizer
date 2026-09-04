# 📚 Lore Organizer for SillyTavern

A frontend-only SillyTavern extension for organizing large collections of native lorebooks / World Info files without merging or modifying them.

Lore Organizer adds an organizational layer above SillyTavern's lorebooks so you can structure them however you want—for example:

```text
Eostia Universe
├── Worlds
│   ├── Eostia
│   ├── Terranovia
│   └── Albion
├── Characters
│   ├── Farryn
│   ├── Aria Flare
│   └── Ruby Slade
└── Systems
    ├── Universal RPG
    ├── Alchemy
    └── Artifacts & Equipment
```

Groups are **organization only**. The underlying lorebooks remain separate native SillyTavern lorebooks and retain their own entries, triggers, recursion settings, insertion logic, and other World Info configuration.

## Features

- Arbitrarily nested groups/folders.
- Lorebooks remain separate native SillyTavern lorebooks.
- Folder metadata is stored only in `extension_settings.lore_organizer`.
- Does **not** add organizer metadata to lorebook JSON files.
- Per-book global activation toggle.
- Enable or disable an entire group, including descendant groups.
- Search groups and lorebooks.
- Desktop drag-and-drop assignment.
- Mobile-friendly **Move to group** selector.
- **Bulk Select** mode for mass-moving lorebooks into groups.
- **Select visible** for fast search → select-all → move workflows.
- Activation presets: save the current global lorebook set and restore it later.
- Ungrouped view for newly imported or unassigned lorebooks.
- No server plugin required.

## Install from GitHub

Once this repository is uploaded to GitHub:

1. Open SillyTavern.
2. Open **Extensions**.
3. Choose **Install Extension**.
4. Paste this repository's GitHub URL.
5. Install, then reload SillyTavern if necessary.

Example repository URL:

```text
https://github.com/YOUR-USERNAME/ST-Lore-Organizer
```

Do **not** paste the URL of an individual file, release ZIP, or GitHub folder. Use the repository URL.

## Enable automatic updates

After you create the GitHub repository, edit `manifest.json`:

```json
"homePage": "https://github.com/YOUR-USERNAME/ST-Lore-Organizer",
"auto_update": true
```

Commit that change to GitHub. SillyTavern can then associate the installed extension with its repository for updates.

The GitHub-ready package intentionally ships with `auto_update` disabled until a real repository URL exists.

## Uploading this package to GitHub

The repository root should look like this:

```text
ST-Lore-Organizer/
├── .gitignore
├── CHANGELOG.md
├── LICENSE
├── README.md
├── manifest.json
├── index.js
└── style.css
```

The important part is that `manifest.json` is at the **repository root**.

### Easiest GitHub website method

1. Create a new **public** repository named `ST-Lore-Organizer`.
2. Do not initialize it with a README, license, or `.gitignore` if you plan to upload this prepared package as-is.
3. Extract the GitHub-ready ZIP locally.
4. In the new repository, choose **Add file → Upload files**.
5. Upload the extracted files themselves—not the containing folder and not the ZIP.
6. Commit the files.
7. Edit `manifest.json` on GitHub and replace the blank `homePage` with your repository URL; set `auto_update` to `true`.
8. Copy the repository URL into SillyTavern's **Install Extension** dialog.

## Local/manual install

Copy the repository folder to:

```text
SillyTavern/public/scripts/extensions/third-party/ST-Lore-Organizer/
```

Then reload SillyTavern.

## How activation works

Lore Organizer does not maintain a fake parallel activation state. Its activation controls call SillyTavern's native World Info/global lorebook activation logic, so the organizer and SillyTavern's normal Global Lore selection are intended to remain synchronized.

## Data model

Organizer state is stored in SillyTavern extension settings under:

```text
extension_settings.lore_organizer
```

The prototype stores:

- groups
- parent/child relationships
- lorebook-to-group assignments
- collapsed state
- activation presets

Deleting the extension does not merge, rewrite, or delete your native lorebooks.

## Current limitations — v0.1.3

- A lorebook belongs to one organizer group at a time.
- Groups cannot yet be reordered with drag-and-drop.
- Lorebooks can be dragged into groups on desktop, but group nesting itself is created with the subgroup button.
- No organizer layout import/export yet.
- No named universe/workspace switcher yet.
- Mobile uses a select menu for assignment rather than touch drag-and-drop.
- This is an early prototype and should be tested against your current SillyTavern installation before relying on it as your only organizational workflow.

## Planned ideas

- Multi-membership / aliases: show the same lorebook in multiple groups without duplicating it.
- Drag-and-drop group nesting and ordering.
- Organizer layout import/export.
- Named universes/workspaces.
- Group activation modes: **Add**, **Remove**, and **Replace Current**.
- Context menus and additional bulk actions.
- Compact/floating launcher.
- Better touch controls.

## License

MIT. See [LICENSE](LICENSE).

- Per-group **Select All / Deselect All** in Bulk Select mode (direct members only).
