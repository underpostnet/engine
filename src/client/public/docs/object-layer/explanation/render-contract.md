# Render contract

A definition names its picture by content. `data.render` is the only canonical reference to that
picture. Every other copy of the picture is local to one host.

## Terms

| term                           | what it is                                                                                                                                                                                    | where it lives                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| canonical render CID           | `data.render.cid`: the CID of the primary render bytes                                                                                                                                        | the definition                                                |
| canonical metadata CID         | `data.render.metadataCid`: the CID of the canonical bytes of the render metadata                                                                                                              | the definition                                                |
| primary render                 | The default render: the PNG the canonical render CID addresses. The client runtime downloads it                                                                                               | IPFS; `AtlasSpriteSheet.fileId` on a host                     |
| minified render                | A render at one pixel per cell. Every primary render a build makes is minified, so it holds each cell once and nothing more                                                                   | the primary render                                            |
| render metadata                | The layout of the primary render: `itemKey`, `atlasWidth` and `atlasHeight` in cells, `cellPixelDim`, `upscaleFactor`, `frame_duration`, `frames`                                             | IPFS; `AtlasSpriteSheet.metadata` on a host                   |
| upscaled derived render        | The primary render at `upscaleFactor` pixels per cell: each pixel copied to a square block, every colour exact. Optional                                                                      | `AtlasSpriteSheet.upscaleFileId`; `GET render/:cid/upscaled`  |
| idle preview                   | The first down-idle frame, or the first frame of any direction, centred on a 300 px square, each cell one whole block. Optional                                                               | `AtlasSpriteSheet.idlePreviewFileId`; `GET idle-preview/:cid` |
| local materialization          | The `AtlasSpriteSheet` document of one definition, named by `objectLayerCid`: the bytes of its render on one host, its derived renders and its decoded metadata. It holds no render CID       | the host database                                             |
| editor source                  | The `ObjectLayerRenderFrames` document of one definition, named by `objectLayerCid`: the frames and palette its render is built from. It is not content, and the render does not give it back | the host database                                             |
| local materialization metadata | `AtlasSpriteSheet.metadata`: the render metadata as this host stores it, the same keys and values the canonical metadata CID addresses                                                        | the host database                                             |

## Computing the contract

```
primary     = PNG of the packed frames, 1 pixel per cell
metadata    = RFC 8785 JCS(render metadata), UTF-8
cid         = CIDv1 raw sha2-256 of primary     (≤ 262144 bytes, one block)
metadataCid = CIDv1 raw sha2-256 of metadata    (≤ 262144 bytes, one block)
```

`canonicalRender()` in `src/api/object-layer/object-layer.identity.js` computes the pair from
the bytes, and the pin stores those exact bytes. The pin parameters are those of the canonical
bytes (see [the identity pipeline](canonical-identity.md#identity-pipeline)), so IPFS must answer
the same CIDs. The writer refuses a pin that answers another CID.

The render metadata carries every direction, empty ones included. The database stores the same
keys, so the pinned metadata and the stored metadata are the same bytes.

The upscale factor is part of the render metadata. A new factor gives a new canonical metadata
CID, so a new definition.

## Rules

1. `data.render` is the only canonical render reference. No other field names a render CID.
2. The definition owns the render contract. `AtlasSpriteSheet` holds no `cid` and no
   `metadataCid`.
3. `AtlasSpriteSheet.fileId` is the primary render. Its bytes hash to `data.render.cid`.
4. `AtlasSpriteSheet.metadata` describes `fileId`. Its canonical bytes hash to
   `data.render.metadataCid`.
5. `upscaleFileId` and `idlePreviewFileId` are derived and optional. A host derives them again
   from the primary render at any time. They never change the contract.
6. One atlas materializes the render of one definition, the one its `objectLayerCid` names, and
   one definition has one atlas. A definition never changes, so neither do the `fileId` and
   `metadata` of its atlas. Two definitions of one render have two atlases over the same Files.
7. `metadata.itemKey` is a label, never an identity. The index on it is not unique. Two
   definitions of one label with different renders have two materializations.
8. A host reaches an atlas by the cid of its definition (`AtlasSpriteSheet.objectLayerCid`), never
   through its label. The definition references no materialization: it stays whole on a host
   without any.
9. A changed render is a changed `data.render`, so a new definition with a new identity.
10. A derivation reads the pixel density from the render bytes: `width / metadata.atlasWidth`.
    Renders at two whole densities of one layout derive the same upscaled render and the same
    idle preview.

## Routes

Every host that holds the definition answers these routes by the CIDs in `data.render`: from its
own atlas when that atlas holds the bytes the CIDs name, else from IPFS. A route never needs a
local materialization, and its answer is immutable.

| route                                                   | answer                                              |
| ------------------------------------------------------- | --------------------------------------------------- |
| `GET /atlas-sprite-sheet/layout/:cid`                   | `{ renderCid, metadataCid, layout }`                |
| `GET /atlas-sprite-sheet/render/:cid`                   | The primary render, as pinned                       |
| `GET /atlas-sprite-sheet/render/:cid/upscaled`          | The upscaled derived render                         |
| `GET /atlas-sprite-sheet/frame-counts/:cid`             | Frames per direction code, and the frame duration   |
| `GET /atlas-sprite-sheet/animation/:cid/:directionCode` | One direction as an animated WebP, upscaled density |
| `GET /atlas-sprite-sheet/idle-preview/:cid`             | The idle preview                                    |

`:cid` is the canonical Object Layer CID of the definition. A host that binds labels to
definitions adds label routes. It resolves a label to the definition it binds, then to that
definition's atlas. A label can move to another render, so a label route answers
`Cache-Control: public, no-cache` with the render File id as ETag: a client keeps its copy and
receives `304` while the label runs on the same render.

ItemLedger registers the Object Layer CID. It reads no render and no atlas.
