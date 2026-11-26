# Page illustrations

- `benefits-gift-reference.webp`: central gift cropped from the reference screenshot supplied by the user on 2026-11-15, with a manually traced transparent silhouette and softened edges for light and dark backgrounds. Surrounding page, offer text and red annotation are omitted. This is a reference-derived asset, not a newly generated image.
- Other page motifs are editable native SVG artwork authored in `page-art.js`; they contain no provider marks. Original provider marks remain in `assets/stations` and `assets/brands`.

- `developers/client-*.webp`: original client presentation artwork assembled from the existing local brand assets. Cursor uses the pointer symbol already used by the developer UI, not an official Cursor logo. There are four client images, each in light and dark variants.
- `developers/example-*.webp`: original product compositions captured from KUGNI's directory, station detail, model ecosystem table, source pricing table, example candy report and methodology pages. The report is a labeled local demonstration; source metrics are dated snapshots. Six images have light and dark variants. These are browser-rendered product images, not AI-generated illustrations, and contain no downloaded competitor imagery.
- Rebuild all developer images with `node scripts/create-developer-visuals.cjs` while the source preview is running. Existing brand attribution remains in `assets/brands/SOURCES.md` and its license.
