# GitHub Action: upload your OpenAPI spec to Stainless

```
stainless-api/upload-openapi-spec
```

[![lint](https://github.com/stainless-api/upload-openapi-spec-action/actions/workflows/lint.yml/badge.svg)](https://github.com/stainless-api/upload-openapi-spec-action/actions/workflows/lint.yml)
[![build](https://github.com/stainless-api/upload-openapi-spec-action/actions/workflows/build.yml/badge.svg)](https://github.com/stainless-apiupload-openapi-spec-action/actions/workflows/build.yml)

A GitHub action for pushing your OpenAPI spec to [Stainless](https://stainlessapi.com/) to trigger regeneration of your SDKs.

Note that there is currently a manual step in between this action and automatic creation of your PR's,
and more manual steps before they are merged and released.

If your account is configured to do so, this action can also output a copy of your OpenAPI spec decorated with sample code snippets,
so that your API reference documentation can show examples of making each request with the user's chosen SDK
(e.g. show `client.items.list()` instead of `curl https://api.my-company.com/items`).

## Example usage

First, obtain an API Key from your Stainless dashboard, and [add it to your GitHub actions secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository) as `STAINLESS_API_KEY`:

```
gh secret set STAINLESS_API_KEY
```

Then, add a new workflow file, or add the action to an existing workflow:

```yaml
name: Upload OpenAPI spec to Stainless

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  stainless:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: stainless-api/upload-openapi-spec-action@main
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          input_path: 'path/to/my-company-openapi.json'
          config_path: 'path/to/my-company.stainless.yaml'
          project_name: 'my-stainless-project'
```

You can identify your Stainless project name on the [Stainless dashboard](https://app.stainlessapi.com/).

## Usage with ReadMe for docs with example snippets

If you use ReadMe's OpenAPI support for your API reference documentation, add the following to your Stainless config:

```yaml
openapi:
  code_samples: readme
```

Then configure your GitHub action to upload the Stainless-enhanced OpenAPI spec to ReadMe:

```yaml
name: Upload OpenAPI spec to Stainless and ReadMe

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  stainless:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: stainless-api/upload-openapi-spec-action@main
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          input_path: 'path/to/my-company-openapi.json'
          config_path: 'path/to/my-company.stainless.yaml'
          output_path: 'path/to/my-company-openapi.documented.json'
          project_name: 'my-stainless-project'
      - uses: readmeio/rdme@v8
        with:
          rdme: openapi "path/to/my-company-openapi.documented.json" --key=${{ secrets.README_TOKEN }} --id=${{ secrets.README_DEFINITION_ID }}
```

This assumes the following secrets have been [uploaded to your Github Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets):

- `secrets.STAINLESS_API_KEY`: Your Stainless API key.
- `secrets.README_TOKEN`: Your API token for readme.com. Only sent to ReadMe's servers.
- `secrets.README_DEFINITION_ID`: According to [ReadMe's documentation](https://docs.readme.com/docs/openapi#re-syncing-an-openapi-document),
  this can be obtained by "clicking edit on the API definition on your project API definitions page". Only sent to ReadMe's servers.

Remember to set the `redameio/rdme` ref version to the latest stable available. You can check the versioning of readmeio's github action [here](https://github.com/marketplace/actions/rdme-sync-to-readme).

## Usage with Mintlify for docs with example snippets

If you use Mintlify's OpenAPI support for your API reference documentation,
add the following to your Stainless config:

```yaml
openapi:
  code_samples: mintlify
```

Mintlify can generate your docs based on the OpenAPI spec in your docs repo if it is [configured to do so](https://mintlify.com/docs/api-playground/openapi/setup#in-the-repo). To integrate Stainless, you can modify the GitHub Action that uploads your OpenAPI spec to Stainless such that it then pushes the Stainless-enhanced OpenAPI spec into your docs repo:

```yaml
name: Upload OpenAPI spec to Stainless and (Mintlify) docs repo

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  stainless:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Push spec and config to Stainless and outputs documented spec
        uses: stainless-api/upload-openapi-spec-action@main
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          input_path: 'config/acme-openapi.yml'
          config_path: 'config/acme.stainless.yml'
          output_path: 'config/acme-openapi.documented.json'
          project_name: 'acme'
      - name: Push documented spec to docs repo
        uses: dmnemec/copy_file_to_another_repo_action@main
        env:
          API_TOKEN_GITHUB: ${{ secrets.API_TOKEN_GITHUB }}
        with:
          source_file: 'config/acme-openapi.documented.json'
          destination_repo: '{DOCS_REPO_NAME}'
          destination_folder: 'openapi-specs' # (optional) the folder in the destination repository to place the file in, if not the root directory
          user_email: '{EMAIL}' # the email associated with the GH token
          user_name: '{USERNAME}' # the username associated with the GH token
          commit_message: 'Auto-updates from Stainless'
```

This assumes the following secrets have been [uploaded to your Github Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets):

- `secrets.STAINLESS_API_KEY`: Your Stainless API key.
- `secrets.API_TOKEN_GITHUB`: A Github [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) with permissions to push to your docs repo.
