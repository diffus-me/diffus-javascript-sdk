//
// Copyright 2026 Diffus. Licensed under MIT License.
//

import { ApiError, type RequestMiddleware, type StorageClient } from "@fal-ai/client";

import { resolveHosts, USER_AGENT } from "./config.js";

type CredentialsResolver = () => string | undefined;
type Fetch = typeof fetch;

type DiffusStorageDependencies = {
    credentials: string | CredentialsResolver | undefined;
    fetch: Fetch | undefined;
    requestMiddleware: RequestMiddleware;
};

function resolveCredentials(
    credentials: string | CredentialsResolver | undefined,
): string | undefined {
    return typeof credentials === "function" ? credentials() : credentials;
}

function resolveFetch(fetchImplementation: Fetch | undefined): Fetch {
    if (fetchImplementation) {
        return fetchImplementation;
    }

    if (typeof fetch === "undefined") {
        throw new Error(
            "Your environment does not support fetch. Please provide your own fetch implementation.",
        );
    }

    return fetch;
}

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof window.document !== "undefined";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && Object.getPrototypeOf(value) === Object.prototype;
}

async function readResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
        return response.json();
    }

    return response.text();
}

type DiffusUploadErrorBody = {
    detail?: string | Array<{ msg?: unknown }>;
};

function uploadErrorMessage(body: unknown, fallback: string): string {
    if (typeof body === "object" && body !== null && "detail" in body) {
        const detail = (body as DiffusUploadErrorBody).detail;
        if (typeof detail === "string") {
            return detail;
        }

        if (Array.isArray(detail)) {
            const messages = detail
                .map((item) => item.msg)
                .filter((message) => typeof message === "string");

            if (messages.length > 0) {
                return messages.join("; ");
            }
        }
    }

    return fallback || "Upload failed";
}

export async function transformInput<Input>(
    storage: StorageClient,
    input: Input | undefined,
): Promise<Input | undefined> {
    if (input === undefined || input === null) {
        return input;
    }

    return (await storage.transformInput(input as Record<string, any>)) as Input;
}

export function createDiffusStorageClient({
    credentials,
    fetch: fetchImplementation,
    requestMiddleware,
}: DiffusStorageDependencies): StorageClient {
    const upload: StorageClient["upload"] = async (file, _options) => {
        const { runHost } = resolveHosts();
        const request = await requestMiddleware({
            method: "POST",
            url: `https://${runHost}/files/upload`,
        });

        const token = resolveCredentials(credentials);
        const response = await resolveFetch(fetchImplementation)(request.url, {
            method: request.method,
            headers: {
                ...(token && { Authorization: `Key ${token}` }),
                "Content-Type": file.type || "application/octet-stream",
                ...(!isBrowser() && { "User-Agent": USER_AGENT }),
                ...request.headers,
            },
            body: file,
        });

        if (!response.ok) {
            const body = await readResponseBody(response);
            throw new ApiError({
                message: uploadErrorMessage(body, response.statusText),
                status: response.status,
                body,
            });
        }

        const body = (await response.json()) as { access_url?: string };
        if (!body.access_url) {
            throw new Error("Upload response is missing access_url");
        }

        return body.access_url;
    };

    const transformValue = async (input: unknown): Promise<unknown> => {
        if (Array.isArray(input)) {
            return Promise.all(input.map((item) => transformValue(item)));
        }

        if (input instanceof Blob) {
            return upload(input);
        }

        if (isPlainObject(input)) {
            const entries = await Promise.all(
                Object.entries(input).map(async ([key, value]) => [
                    key,
                    await transformValue(value),
                ]),
            );
            return Object.fromEntries(entries);
        }

        return input;
    };

    const transformInput: StorageClient["transformInput"] = async (input) =>
        (await transformValue(input)) as Record<string, any>;

    return {
        upload,
        transformInput,
    };
}
