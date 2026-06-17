//
// Copyright 2026 Diffus. Licensed under MIT License.
//

import type { QueueClient, QueueStatus, StorageClient } from "@fal-ai/client";

import { IN_PROGRESS_POLL_INTERVAL, QUEUED_POLL_INTERVAL } from "./config.js";
import { transformInput } from "./storage.js";

type SubscribeOptions = Parameters<QueueClient["subscribeToStatus"]>[1];

function pollInterval(status: QueueStatus): number {
    return status.status === "IN_QUEUE" ? QUEUED_POLL_INTERVAL : IN_PROGRESS_POLL_INTERVAL;
}

export function wrapQueueClient(queue: QueueClient, storage: StorageClient): QueueClient {
    return {
        ...queue,
        async submit(endpointId, options) {
            const input = await transformInput(storage, options.input);
            return queue.submit(endpointId, { ...options, input });
        },
        async streamStatus(endpointId, options) {
            if (options.connectionMode === "client") {
                throw new Error("Diffus does not support client-mode queue status streaming");
            }
            return queue.streamStatus(endpointId, options);
        },
        async subscribeToStatus(endpointId, options) {
            if (options.mode === "streaming") {
                if (options.connectionMode === "client") {
                    throw new Error("Diffus does not support client-mode queue status streaming");
                }
                return queue.subscribeToStatus(endpointId, options);
            }

            return subscribeToStatus(queue, endpointId, options);
        },
    };
}

async function subscribeToStatus(
    queue: QueueClient,
    endpointId: string,
    options: SubscribeOptions,
) {
    const startedAt = Date.now();

    while (true) {
        if (options.abortSignal?.aborted) {
            throw options.abortSignal.reason ?? new Error("The request was aborted");
        }

        if (options.timeout && Date.now() - startedAt >= options.timeout) {
            await queue.cancel(endpointId, { requestId: options.requestId });
            throw new Error(
                `Client timed out waiting for the request to complete after ${options.timeout}ms`,
            );
        }

        const status = await queue.status(endpointId, {
            requestId: options.requestId,
            logs: options.logs ?? false,
            abortSignal: options.abortSignal,
        });
        options.onQueueUpdate?.(status);

        if (status.status === "COMPLETED") {
            return status;
        }

        await sleep(pollInterval(status), options.abortSignal);
    }
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timeout);
            reject(signal?.reason ?? new Error("The request was aborted"));
        };
        const timeout = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, milliseconds);

        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
