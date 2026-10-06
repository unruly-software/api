---
"@unruly-software/api-client": minor
---

Add `defineVirtualEndpoints` for client-only endpoints that are batched through a real endpoint. Each caller still gets its own validated response and `$succeeded` / `$failed` event. `createBatchLoader` is also exported.
