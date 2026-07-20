# model-dyno

Public source and GitHub Pages deployment for the model-dyno dashboard.

The `main` branch owns website source, tests, and the currently published PublicBundle
snapshot. GitHub Actions builds and deploys `dist/`; the historical `gh-pages` branch is
retained as the pre-migration publication record and rollback source.

## Local verification

```sh
npm ci
npm test
npm run build
test -f dist/index.html
test -f dist/public-bundles/index.json
```

Source deployment is deliberate/manual: run the `deploy-pages` workflow after a verified source
update. A push that changes only the cleared `public/public-bundles/` snapshot deploys
automatically; such pushes are produced by the private repository's own manually triggered publish
workflow. Ordinary source pushes do not spend deployment minutes.

The website consumes only the five-file PublicBundle projection under
`public/public-bundles/`. It does not read private `llm-playground` source, transcripts,
diffs, logs, profiles, or benchmark result trees.

## Updating public data

Replace `public/public-bundles/` only with an already cleared public feed, then run the local
verification commands and commit the source plus snapshot together. Every bundle referenced by
`index.json` is checked for its exact file set and manifest hashes before deployment.

Package/import identities for the related private framework remain documented by the private
`llm-playground` Plan 044 integration pin; this repository is only the public website consumer.
