# Build Stainless SDKs from GitHub Actions

GitHub Actions for building [Stainless](https://stainless.com/) SDKs and
previewing changes to an SDK from a pull request. Refer to [our
docs on automating builds](https://www.stainless.com/docs/guides/automate-updates) for more information.

Support for GitLab CI is available. See the [GitLab example](./examples/merge_request_gitlab.yml).

## Authentication

[Install the Stainless GitHub App](https://www.stainless.com/docs/guides/publish/#install-the-stainless-github-app) and link it to your Stainless organization. The action will authenticate using GitHub OIDC—no API keys needed.

**GitLab CI:** OIDC isn't yet supported. Set the `STAINLESS_API_KEY` environment variable instead. See the template files in `build/gitlab-ci.yml`, `merge/gitlab-ci.yml`, and `preview/gitlab-ci.yml`.

**API keys:** If you'd rather use an API key, see [pull_request_api_key.yml](./examples/pull_request_api_key.yml) and add a `STAINLESS_API_KEY` secret to your repo.

## Usage

Add a workflow file to the repository that contains your OpenAPI spec:

<details>
<summary><code>.github/workflows/stainless.yml</code></summary>

```yml
name: Build SDKs for pull request

on:
  pull_request:
    types:
      - opened
      - synchronize
      - reopened
      - closed

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number }}
  cancel-in-progress: true

env:
  STAINLESS_ORG: YOUR_ORG
  STAINLESS_PROJECT: YOUR_PROJECT
  OAS_PATH: YOUR_OAS_PATH

jobs:
  preview:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      id-token: write # Required for GitHub OIDC authentication
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Run preview builds
        uses: stainless-api/upload-openapi-spec-action/preview@v1
        with:
          org: ${{ env.STAINLESS_ORG }}
          project: ${{ env.STAINLESS_PROJECT }}
          oas_path: ${{ env.OAS_PATH }}

  merge:
    if: github.event.action == 'closed' && github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      id-token: write # Required for GitHub OIDC authentication
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Run merge build
        uses: stainless-api/upload-openapi-spec-action/merge@v1
        with:
          org: ${{ env.STAINLESS_ORG }}
          project: ${{ env.STAINLESS_PROJECT }}
          oas_path: ${{ env.OAS_PATH }}
```

</details>

Then, pull requests to your GitHub repository that update OpenAPI spec or
Stainless config will build your SDKs and make a comment with the results.

Note: the `merge` job depends on the `preview` job, so you can't use just
the `merge` job alone. See [our docs](https://www.stainless.com/docs/guides/automate-updates) for more details.

For more details about the input parameters, see the
[example workflow](./examples/pull_request.yml) file.

For more examples of usage, including push-based workflows, using code samples,
integration with docs platforms, and testing preview builds, see the [examples
directory](./examples).

## Security

If your GitHub repository is public, require approval for workflows from fork PRs to prevent untrusted contributors from accessing OIDC tokens or secrets.

Go to **Settings** → **Actions** → **General**, then under "Fork pull request workflows from outside collaborators", select **"Require approval for all outside collaborators"**.

See [GitHub's docs](https://docs.github.com/en/actions/managing-workflow-runs/approving-workflow-runs-from-public-forks) for more details.

## Actions reference

This repository provides four GitHub actions:

- `stainless-api/upload-openapi-spec-action/build` - Build SDKs for a Stainless project. See the [action definition](./build/action.yml) for input parameters.

- `stainless-api/upload-openapi-spec-action/preview` - Preview SDK changes from a pull request. See the [action definition](./preview/action.yml) for input parameters.

- `stainless-api/upload-openapi-spec-action/merge` - Merge SDK changes from a pull request. See the [action definition](./merge/action.yml) for input parameters.

- `stainless-api/upload-openapi-spec-action/checkout-pr-ref` - Checkout the base or head commit for previewing changes. See the [action definition](./checkout-pr-ref/action.yml) for input parameters.

All except `checkout-pr-ref` work in GitLab CI.

The `preview` and `merge` actions output an `install_url` for each SDK language. You can use this to test builds directly from the Stainless package server before merging. See the [SDK usage example](./examples/pull_request_sdk_usage.yml).

## Versioning

These actions use [semantic versioning](https://semver.org/), and you can pin
your action to a major (`v1`), minor (`v1.0`), or patch (`v1.0.0`) version.
The public API includes:

- The inputs to each action, and their expected format.

- The format of pull request comments.

- The name and format of the file written to `documented_spec_path`.

The public API does not include:

- The format of the `outcomes` and `base_outcomes` outputs.
