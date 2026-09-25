# Atlas render determinism

## Question

A definition's minified atlas — one pixel per cell — was stored as a File beside the full render.
Could it be derived from the full atlas on request instead, and would the derived bytes be the
same as the stored ones?

## What was tried

The first attempt resized the full atlas with `sharp`, using `kernel: 'nearest'` to avoid
interpolation. Against the 53 stored minified renders it produced differences of ±2 in the RGB
channels of semi-transparent pixels. The cause is premultiplied alpha: the resize path
premultiplies, samples and unpremultiplies, and the round trip is lossy where alpha is neither 0
nor 255.

The second attempt skipped the resize entirely: read the atlas as raw RGBA and copy one pixel per
`upscaleFactor` block, which is what the generator did when it wrote the stored render.

## Result

Byte-identical output for all 53 stored renders. The derived path replaced the stored one for
requests, and the render is now addressed by the cid of the atlas it came from, so it is cached
for good rather than stored per definition.

## What this generalises to

An image operation that claims to be lossless is only lossless for the channel layout it was
given. When output must match bytes produced by another path, sample the source directly rather
than asking an image library for an equivalent transform.
