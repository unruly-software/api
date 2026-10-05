---
"@unruly-software/api-query": minor
---

Add `useAPIInfiniteQuery`, a typed `useInfiniteQuery` wrapper returned by `mountAPIQueryClient`. Pages are cached under the endpoint's resolved key with `'$infinite'` appended, so existing prefix invalidations also refetch them.
