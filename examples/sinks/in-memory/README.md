# In-memory example

Generates a small, complete, navigable dataset for a unit test — no database, no I/O. The
`DataGraph` returned by `createInMemoryGraphSink` holds every generated row and navigates
relationships through `parentOf` and `childrenOf`.

Names, emails and coordinates come from faker, seeded once with the generation seed, so a failing
test can be replayed exactly.

```sh
npm test
```
