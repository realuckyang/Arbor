# Components

Components are grouped by product area, not by widget shape.

- `chat/`: conversation UI, message grouping, tool-call rendering.
- `command/`: global overlays such as quick open, command palette, and search.
- `explorer/`: left workspace tree, tree rows, context menus, breadcrumbs.
- `files/`: file preview/editing surfaces and code editor wrappers.
- `settings/`: settings screens.
- `ui/`: small reusable UI primitives that are not tied to a product area.
- `workspace/`: tab bars, process preview/log surfaces, and future tab-group layout.

Prefer importing from each folder's `index.ts` at feature boundaries. Keep leaf-to-leaf imports inside the same folder local.
