# App Shell Layout

The app shell is the frame around every view of a client: the header, the footer, the navigation
drawer and the main body. `ShellLayout` owns its geometry and its state. `ShellNavigation` owns the
drawer entries and the views they open. `Modal` renders the views and keeps their window behavior.

## Layouts

A shell selects one layout. The layout sets the bar heights. The drawer side is independent of it.

| Layout     | Header | Footer | Header controls, start | Header controls, end                  | Footer controls |
| ---------- | ------ | ------ | ---------------------- | ------------------------------------- | --------------- |
| `split`    | 50px   | 50px   | navigation (left)      | search, navigation (right)            | hide bars       |
| `standard` | 100px  | none   | navigation (left)      | search, hide bars, navigation (right) | none            |

`standard` shows the tool row (language, theme, home, history) as the second header row.

## Configuration

The shell declares its layout on the drawer modal:

```js
await Modal.instance({
  id: 'modal-menu',
  mode: 'slide-menu',
  shell: { layout: 'split', side: 'right' },
  html: await ShellNavigation.render(navigation),
  // ...
});
ShellNavigation.bind(navigation);
```

- `layout` is `split` (default) or `standard`.
- `side` is `left` (default) or `right`.
- Any other value stops the shell with the unknown value and the accepted ones.

A view gives no layout option. A maximized view with `slideMenu: 'modal-menu'` fills the main body.

## Behavior

- The drawer overlays the main body at every viewport width. It never moves or resizes the body.
- A scrim covers the body while the drawer is open. A click on it, Escape or the navigation toggle
  closes the drawer.
- An entry closes the drawer when it opens a view. A submenu entry keeps it open.
- The hide-bars control slides the header and footer away and gives the body the whole viewport.
  The first scroll of the home body past 100px does the same.
- While the bars hide, two fixed controls show at the top corner of the drawer side: the navigation
  toggle at the edge and the restore control beside it. They take no layout space. The navigation
  toggle brings the bars back and opens the drawer.
- A maximized view pads its header bar on the drawer side while the bars hide, so the fixed controls
  never cover its title or its window buttons. Its title stops before its window buttons and clips
  when it is too long.
- The search control replaces the banner with the search field. Shift+K and Alt+K show the bars and
  focus the field. On a viewport narrower than 600px the app icon hides while the field shows.

## Geometry

`ShellLayout` computes the geometry once per state change and publishes it on the root element.

| Property                | Value                                      |
| ----------------------- | ------------------------------------------ |
| `--shell-header-height` | Header height of the layout                |
| `--shell-footer-height` | Footer height of the layout                |
| `--shell-body-top`      | Header height, or 0 while the bars hide    |
| `--shell-body-bottom`   | Footer height, or 0 while the bars hide    |
| `--shell-drawer-width`  | 320px, or the viewport width when narrower |
| `--shell-header-start`  | Width of the controls at the header start  |
| `--shell-header-end`    | Width of the controls at the header end    |

The root element also carries `data-shell-layout`, `data-shell-drawer`, `data-shell-chrome` and
`data-shell-search`. Styles read these values. No other module computes shell geometry.

## Navigation Entries

`ShellNavigation` renders one drawer button per entry, as `.main-btn-<id>`, and binds it.

| Property   | Use                                                                         |
| ---------- | --------------------------------------------------------------------------- |
| `id`       | Button class and default route.                                             |
| `route`    | Route when it differs from `id`. `''` is the home route.                    |
| `icon`     | Icon markup.                                                                |
| `image`    | Image under `assets/ui-icons/`, drawn with the `iconSet` of the shell.      |
| `text`     | Label markup. The translation of `id` by default.                           |
| `href`     | Link target. The route by default.                                          |
| `hidden`   | Starts hidden. Role logic shows it.                                         |
| `session`  | Starts hidden. `Auth` shows it while a session is open.                     |
| `active`   | Starts as the active entry.                                                 |
| `submenu`  | Owns the submenu of its id: caret, panel and toggle.                        |
| `children` | Fixed entries of the submenu.                                               |
| `badge`    | Extra label markup, such as an unread badge.                                |
| `view`     | Returns the options of the view `modal-<id>`.                               |
| `action`   | Runs instead of `view`, as `(event, open)`. `open(options)` opens the view. |

An entry with neither `view` nor `action` gets no handler. The home entry is one: `Modal` binds it.
`ShellNavigation.openView` opens every view with the shell defaults: maximized in the main body, on
the entry route, titled with the entry icon and label. The view options override the defaults.

## Accessibility

- The navigation toggle has `aria-expanded` and `aria-controls="shell-drawer"`. The drawer is a
  `navigation` landmark. The search toggle exposes its state the same way.
- Every control has a translated accessible name.
- A closed drawer and hidden bars are `inert`, so no hidden control keeps the focus.
- The fixed navigation toggle has the name and state of the header toggle.
- Opening the drawer moves the focus to its first entry. Closing it returns the focus to the visible toggle.
- Hiding the bars moves their focus to the restore control. Restoring moves it to the hide-bars
  control. Closing the search moves the focus from the covered field to the search toggle.
- With `prefers-reduced-motion`, the shell transitions are off.

## Checks

- `test/underpost/unit/shell-layout.test.js` checks the presets, the geometry, the state rules and
  the focus and ARIA behavior.
- `test/underpost/unit/shell-navigation.test.js` checks the rendering and the activation of entries.
- `test/underpost/unit/shell-menu-icons.test.js` checks that image-set shells draw every visible
  entry from the set.
- `test/ecosystem/contract/docs-submenu.test.js` checks that a shell offering documentation declares
  the docs entry a submenu.
