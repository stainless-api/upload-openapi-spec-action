# Build Stainless SDKs from GitHub Actions

GitHub Actions for building [Stainless](https://stainless.com/) SDKs and
previewing changes to an SDK from a pull request.

## Usage

Get an API key from your Stainless organization dashboard. In the GitHub
repository that stores your ground truth OpenAPI spec, add the key to the
[repository secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository)
with the name `STAINLESS_API_KEY`. You can do this with the GitHub CLI via:

```bash
gh secret set STAINLESS_API_KEY
```

In the same repository, add a new workflow file:

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
  COMMIT_MESSAGE: ${{ github.event.pull_request.title }}

jobs:
  preview:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Run preview builds
        uses: stainless-api/build-sdk-action/preview@3fa5f068d05f51899b2903965e0ec395743d005f
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          org: ${{ env.STAINLESS_ORG }}
          project: ${{ env.STAINLESS_PROJECT }}
          oas_path: ${{ env.OAS_PATH }}
          commit_message: ${{ env.COMMIT_MESSAGE }}

  merge:
    if: github.event.action == 'closed' && github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Run merge build
        uses: stainless-api/build-sdk-action/merge@3fa5f068d05f51899b2903965e0ec395743d005f
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          org: ${{ env.STAINLESS_ORG }}
          project: ${{ env.STAINLESS_PROJECT }}
          oas_path: ${{ env.OAS_PATH }}
          commit_message: ${{ env.COMMIT_MESSAGE }}
```
</details>

Then, pull requests to your GitHub repository that update OpenAPI spec or
Stainless config will build your SDKs and make a comment with the results.

For more details about the input parameters, see the
[example workflow](./examples/pull_request.yml) file.

For more examples of usage, including push-based workflows, using code samples,
and integration with docs platforms, see the [examples directory](./examples).

## Actions

This repository provides three GitHub actions.

- `stainless-api/build-sdk-action`: Build SDKs for a Stainless project. For
information about the input parameters, see the [action definition](./action.yml).

- `stainless-api/build-sdk-action/preview`: Preview changes to SDKs introduced
by a pull request. For information about the input parameters, see the
[action definition](./preview/action.yml).

- `stainless-api/build-sdk-action/merge`: Merge changes to SDKs from a pull
request. For information about the input parameters, see the
[action definition](./merge/action.yml).

### Workflow permissions

The GitHub actions use the following
[workflow permissions](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#jobsjob_idpermissions):

- The `preview` and `merge` actions have a `make_comment` input, which, if set,
will comment on the pull request with the build results. This is set to true by
default. The actions use the `github_token` input to make a comment, and the
comment must have the `pull-requests: write` permission.

- The `preview` action relies on being in a Git repository that can fetch from
the remote to determine base revisions. This will be the case if you use the
[`actions/checkout`](https://github.com/actions/checkout) GitHub action
beforehand. That action needs the `contents: read` permission.

### Versioning policy

This action is in public beta, and breaking changes may be introduced in any
commit. We recommend pinning your actions to a full-length commit SHA to avoid
potential breaking changes.
