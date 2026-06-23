# Diffus JavaScript SDK

`@diffus/client` is a lightweight wrapper around the
[`@fal-ai/client`](https://www.npmjs.com/package/@fal-ai/client) JavaScript SDK.
It routes the fal SDK interfaces to the [diffus.me](https://www.diffus.me)
platform for AI image and video generation.

## Installation

```bash
npm install @diffus/client
```

## Authentication

Set your Diffus API key before the first API request.

```bash
export DIFFUS_KEY="YOUR_API_KEY"
```

You can also configure credentials in JavaScript before making a request:

```js
import { fal } from "@diffus/client";

fal.config({
    credentials: "YOUR_API_KEY",
});
```

## Usage

### Subscribe

Use `subscribe` to submit a generation request and wait for the final result.

```js
import { fal } from "@diffus/client";

const result = await fal.subscribe("diffus-ai/dreamshaper-8", {
    input: {
        prompt: "A cinematic portrait of a dancing girl",
        aspect_ratio: "16:9",
        resolution: "720p",
        batch_size: 2,
    },
});

console.log(result);
```

### Upload

Use `fal.storage.upload` to upload a local file to Diffus Image Gallery. It
returns a URL that can be used as model input.

```js
import { readFile } from "node:fs/promises";
import { fal } from "@diffus/client";

const file = new Blob([await readFile("input.jpg")], {
    type: "image/jpeg",
});

const imageUrl = await fal.storage.upload(file);

console.log(imageUrl);
```
