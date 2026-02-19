# @platformatic/image-optimizer

Detect, fetch, and optimize images with [`sharp`](https://sharp.pixelplumbing.com/), with optional queue-backed processing via [`@platformatic/job-queue`](https://github.com/platformatic/job-queue).
A small utility to detect, fetch, and optimize images using .

## Features

- Detects image type from file signatures (magic bytes)
- Optimizes raster images (`jpeg`, `png`, `webp`, `avif`)
- Prevents animated image optimization
- Supports optional SVG passthrough
- Provides `fetchAndOptimize()` for URL-based workflows
- Throws structured `ImageError` objects

## Installation

```bash
npm i @platformatic/image-optimizer
```

## API

### `optimize(buffer, width, quality, allowSVG = false)`

Optimizes an input image buffer.

- `width`: target max width (`withoutEnlargement` is enabled)
- `quality`: output quality used by format-specific encoders
- `allowSVG`: when `false` (default), SVG images are not optimized and it throws an error

### `fetchAndOptimize(url, width, quality, allowSVG = false)`

Fetches an image using `fetch()` and then runs `optimize()`.
Returns an object with:

- `buffer`: optimized image buffer
- `contentType`: upstream `content-type` response header (or `null`)
- `cacheControl`: upstream `cache-control` response header (or `null`)

### `detectImageType(buffer)`

Returns the detected image type (for example `jpeg`, `png`, `webp`) or `null`.

### `ImageOptimizerQueue`

Queue-backed optimizer powered by [`@platformatic/job-queue`](https://www.npmjs.com/package/@platformatic/job-queue).

Methods:

- `start()`
- `stop()`
- `optimize(buffer, width, quality, allowSVG?)`
- `fetchAndOptimize(url, width, quality, allowSVG?)`

> `@platformatic/job-queue` is an optional dependency. Install it if you want to use `ImageOptimizerQueue`.

## Example

```ts
import { fetchAndOptimize } from '@platformatic/image-optimizer'

const { buffer, contentType, cacheControl } = await fetchAndOptimize('https://example.com/image.jpg', 800, 75)
```

## License

Apache-2.0 - See [LICENSE](LICENSE) for more information.
