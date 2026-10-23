# Home-page workspace preview

The home page shows an actual Canopy workspace captured with an isolated sample project. It is a static product illustration, not the visitor's workspace or a live AI conversation.

## Production assets

| File                                  | Size       | Contents                                                                  |
| ------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `public/workspace-preview-light.webp` | 1440 × 900 | Light-theme editor, project explorer and three configured context sources |
| `public/workspace-preview-dark.webp`  | 1440 × 900 | The same sample workspace in Dark mode                                    |

Both files use lossless WebP encoding so source text stays crisp. They are served locally with the app; there are no external image requests.

`HomePage.tsx` places the preview after the hero capabilities and before the context explanation. `home-page.css` selects the matching image through the resolved `data-theme` attribute, including manual theme overrides. The images have fixed dimensions and lazy loading, preserve their full frame on small screens, and link to full resolution. **Explore Canopy** jumps to this section; **Open workspace** enters the working application.

## Capture method

The captures were made on 2026-10-24 from the built production application through headless Chromium at 1440 × 900. A temporary project and SQLite data directory were created solely for capture, then removed. The sample contains `src/catalog.ts`, `src/types.ts`, and a README. Its conversation is named **Improve catalog search**, with the two source files and **Review guidelines** explicitly selected.

No provider was configured and no model response was generated. The context panel correctly shows **Configured** sources and **Not composed yet**. No normal application database, credentials, or user project was used.

Raw PNG captures remain in ignored `artifacts/workspace-preview-{light,dark}.png`. The committed assets were encoded without cropping or changing interface content:

```bash
magick artifacts/workspace-preview-light.png \
  -define webp:lossless=true public/workspace-preview-light.webp
magick artifacts/workspace-preview-dark.png \
  -define webp:lossless=true public/workspace-preview-dark.webp
```

Refresh both images when the workspace UI materially changes. Keep the sample-project caption visible, and keep the home page independent of workspace bootstrap APIs.
