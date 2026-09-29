# Editor source format

The editor source of a definition is the `ObjectLayerRenderFrames` document its `objectLayerCid`
names. It holds the frames and the palette the render is built from. One document exists per
definition. `src/client/components/objectlayer-studio/RenderSource.js` is the one codec for it, in the
editor and on the server.

## Fields

| field             | holds                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| `objectLayerCid`  | The canonical CID of the definition                                             |
| `format`          | `indexed8`: one byte per cell, an index into `palette`                          |
| `width`, `height` | The cells of every frame; all frames of a source have one size                  |
| `palette`         | Up to 256 `#rrggbbaa` colors                                                    |
| `frameDurationMs` | The duration of each frame                                                      |
| `frames`          | Frames by render keyframe (`down_idle`, `up_walking`, …); each frame one buffer |
| `revision`        | The writes of the document                                                      |

Each frame holds `width × height` palette indexes, row by row.

## Stored and wire forms

The editor holds each frame as a `Uint8Array`. MongoDB stores it as BSON Binary. JSON carries it as
base64 text: the API, the Studio save and instance backups use this wire form. `toWire()` writes
the fields in one order and the keyframes sorted, so one source always gives the same text.

```json
{
  "format": "indexed8",
  "width": 25,
  "height": 25,
  "palette": ["#00000000", "#000000ff"],
  "frameDurationMs": 250,
  "frames": { "down_idle": ["AAAB…"] }
}
```

`fromWire()` refuses an unknown format, a palette over 256 colors or not `#rrggbbaa`, a frame of
another size, and an index past the palette.

## Writes

- `materialize(cid, source)` stores a source. A source that holds the same render writes nothing,
  so a rerun changes nothing. Each write adds one to `revision`.
- `PUT /object-layer-render-frames/:id` replaces a source when the body names the stored
  `revision`. Another revision answers 409: reload before saving.
- `GET /object-layer/render/:id` answers the source in wire form, with its `revision`.

The Cyberia Studio publishes a changed render as a new definition. A save made from a definition
the item label no longer binds answers 409, so no save overwrites a newer one.

## Migration

`ObjectLayerRenderFrames.migrateFormat()` moves every stored source of the nested-matrix form
(`colors`, `frame_duration`) to `indexed8`. The identity migration runs it before a Cyberia write.
It is idempotent.
