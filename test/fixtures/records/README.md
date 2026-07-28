# Record fixtures

Shared PGN, 5DPGN, and FEN fixtures belong in this directory when more than one
workspace package may need them. Keep the files as source-format test data and
put package-specific expectations in the package that owns the behavior.

Tests should resolve fixtures relative to their source file instead of relying
on the process working directory. For example:

```ts
const fixtureUrl = new URL('../../../test/fixtures/records/example.5dpgn', import.meta.url)
```

Fixtures used by only one package may remain next to that package's tests.
