# Build Stainless SDKs from GitHub Actions

GitHub Actions for building [Stainless](https://stainless.com/) SDKs and
previewing changes to an SDK from a pull request. Refer to [our
docs on automating builds](https://www.stainless.com/docs/guides/automate-updates) for more information.

Support for GitLab CI is available. See the [GitLab example](./examples/merge_request_gitlab.yml).

## Authentication

The action supports two authentication methods:

**GitHub OIDC (recommended):** [Install the Stainless GitHub
App](https://www.stainless.com/docs/guides/publish/#install-the-stainless-github-app) in your GitHub organization and
link it to your Stainless organization. The app doesn't need access to the repository containing the workflow — just the
org-level installation is enough. The action will authenticate automatically using GitHub OIDC. This is the default
method shown in our examples.

With OIDC (short for OpenID Connect), there's no secret to set up or rotate — GitHub mints a short-lived, cryptographically signed token for each
workflow run that can be validated by Stainless.

> [!NOTE]
> OIDC authentication requires the GitHub organization running the workflow is the same GitHub organization that is linked to your Stainless organization. If your spec is in a different GitHub organization, you must use API key authentication instead.

**API keys:** Generate an API key from your Stainless organization dashboard and add it as a `STAINLESS_API_KEY` secret. This works well for getting started or when you don't have admin permissions to install the GitHub App. See [pull_request_api_key.yml](./examples/pull_request_api_key.yml) for the workflow setup.

> [!NOTE]
> **GitLab CI:** OIDC isn't yet supported. Use the API key method and set the `STAINLESS_API_KEY` environment variable. See the template files in `build/gitlab-ci.yml`, `merge/gitlab-ci.yml`, and `preview/gitlab-ci.yml`.

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
      id-token: write
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
      id-token: write
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

<details>
<summary><b>Workflow permissions</b></summary>

The workflows require the following [permissions](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#jobsjob_idpermissions):

- **`id-token: write`** - Required for GitHub OIDC authentication. Allows the workflow to request an OIDC token from GitHub.

- **`pull-requests: write`** - Required for posting comments on pull requests with build results. If you don't need comments, you can set `make_comment: false` and remove this permission.

- **`contents: read`** - Required for checking out the repository code to read the OpenAPI spec and config files.

</details>

## Security

If your GitHub repository is public, require approval for workflows from fork PRs to prevent untrusted contributors from accessing OIDC tokens or secrets.

Go to **Settings** → **Actions** → **General**, then under "Fork pull request workflows from outside collaborators", select **"Require approval for all outside collaborators"**.

See [GitHub's docs](https://docs.github.com/en/actions/managing-workflow-runs/approving-workflow-runs-from-public-forks) for more details.

In order to improve our service, Stainless collects information about whether an action run succeeded or failed. To disable this telemetry collection, set the `STAINLESS_DISABLE_TELEMETRY=1` environment variable in your configuration.

## Actions reference

This repository provides several GitHub actions:

### Core Actions

- `stainless-api/upload-openapi-spec-action/build` - Build SDKs for a Stainless project. See the [action definition](./build/action.yml) for input parameters.

- `stainless-api/upload-openapi-spec-action/preview` - Preview SDK changes from a pull request. See the [action definition](./preview/action.yml) for input parameters.

- `stainless-api/upload-openapi-spec-action/merge` - Merge SDK changes from a pull request. See the [action definition](./merge/action.yml) for input parameters.

- `stainless-api/upload-openapi-spec-action/checkout-pr-ref` - Checkout the base or head commit for previewing changes. See the [action definition](./checkout-pr-ref/action.yml) for input parameters.

### Preparation Tools

- `stainless-api/upload-openapi-spec-action/prepare/combine` - Combine multiple OpenAPI spec files into one. See the [action definition](./prepare/combine/action.yml) for input parameters.

- `stainless-api/upload-openapi-spec-action/prepare/swagger` - Convert Swagger 2.0 specs to OpenAPI 3.x. See the [action definition](./prepare/swagger/action.yml) for input parameters and the [example workflow](./examples/prepare_swagger.yml).

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
