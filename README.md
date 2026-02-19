# @platformatic/image-optimizer

Detect, fetch, and optimize images with [`sharp`](https://sharp.pixelplumbing.com/), with optional queue-backed processing via [`@platformatic/job-queue`](https://github.com/platformatic/job-queue).

## Features

- Detects image type from file signatures (magic bytes)
- Optimizes raster images (`jpeg`, `png`, `webp`, `avif`)
- Prevents animated image optimization
- Supports optional SVG passthrough
- Provides `fetchAndOptimize()` for URL-based workflows (via `undici.request()`)
- Provides queue APIs (`Queue`, `createQueue`) powered by [`@platformatic/job-queue`](https://www.npmjs.com/package/@platformatic/job-queue) for distributed work
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

Fetches an image and then runs `optimize()`.
Returns:

- `buffer`: optimized image buffer
- `contentType`: upstream `content-type` response header (or `null`)
- `cacheControl`: upstream `cache-control` response header (or `null`)

### `detectImageType(buffer)`

Returns the detected image type (for example `jpeg`, `png`, `webp`) or `null`.

### `Queue`

Queue-backed optimizer powered by [`@platformatic/job-queue`](https://www.npmjs.com/package/@platformatic/job-queue).

Methods:

- `start()`
- `stop()`
- `optimize(buffer, width, quality, allowSVG?)` (auto-starts on first use)
- `fetchAndOptimize(url, width, quality, allowSVG?)` (auto-starts on first use)

### `createQueue(options?)`

Creates and starts a `Queue` instance.

## Example

```ts
import { createQueue, fetchAndOptimize } from '@platformatic/image-optimizer'

const queue = await createQueue({ concurrency: 2 })
const { buffer } = await fetchAndOptimize('https://example.com/image.jpg', 800, 75)
await queue.stop()
```

## License

Apache-2.0 - See [LICENSE](LICENSE) for more information.
