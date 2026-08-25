# README block compilation

Not an example. The root test suite (`test/readme.test.js`) extracts every fenced TypeScript block
from the project README, writes it into `blocks/` here, and typechecks it against the published
types plus this package's schema and rules — so the documentation cannot drift from the API. This
package exists to give those blocks their dependencies without burdening any real example.
