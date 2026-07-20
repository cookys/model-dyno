# Dashboard PublicBundle fixtures

These fixtures are checked-in website test inputs for Plan 042. Each immediate
child directory under this folder must be an exact five-file `PublicBundle`
directory:

- `manifest.json`
- `benches.json`
- `subjects.json`
- `runs.json`
- `scores.json`

Do not place README files or helper metadata inside an individual bundle
directory; the package validator intentionally rejects extra files.

`toy-v3/` is generated from `packages/model-dyno-eval/examples/toy-bench/` with
the deterministic dummy factory path and validates as `public_bundle.v3`.
