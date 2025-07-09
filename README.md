# Upload your OpenAPI spec to Stainless (GitHub Action & GitLab CI)

```
stainless-api/upload-openapi-spec
```

[![lint](https://github.com/stainless-api/upload-openapi-spec-action/actions/workflows/lint.yml/badge.svg)](https://github.com/stainless-api/upload-openapi-spec-action/actions/workflows/lint.yml)
[![build](https://github.com/stainless-api/upload-openapi-spec-action/actions/workflows/build.yml/badge.svg)](https://github.com/stainless-api/upload-openapi-spec-action/actions/workflows/build.yml)

A CI component for pushing your OpenAPI spec to [Stainless](https://stainless.com/) to trigger regeneration of your SDKs. Supports both GitHub Actions and GitLab CI.

Note that there is currently a manual step in between this action and automatic creation of your PR's,
and more manual steps before they are merged and released.

If your account is configured to do so, this action can also output a copy of your OpenAPI spec decorated with sample code snippets,
so that your API reference documentation can show examples of making each request with the user's chosen SDK
(e.g. show `client.items.list()` instead of `curl https://api.my-company.com/items`).

## Example usage

First, obtain an API Key from your Stainless dashboard.

### GitHub Actions

For GitHub Actions, [add the API key to your repository secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository) as `STAINLESS_API_KEY`:

```
gh secret set STAINLESS_API_KEY
```

Then, in your repo that stores your ground truth OpenAPI spec, add a new workflow file, or add the action to an existing workflow:

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
          input_path: "path/to/my-company-openapi.json"
          project_name: "my-stainless-project"
          commit_message: "feat(api): my cool feature"
          guess_config: true
```

You can optionally add `config_path: 'path/to/my-company.stainless.yaml'` to the `with:` block if you'd like to send us updates to your Stainless config.

### GitLab CI

For GitLab CI, add the API key to your [GitLab CI/CD variables](https://docs.gitlab.com/ee/ci/variables/#add-a-cicd-variable-to-a-project) as `STAINLESS_API_KEY`.

Then, add the following to your `.gitlab-ci.yml` file:

```yaml
include:
  - remote: "https://raw.githubusercontent.com/stainless-api/upload-openapi-spec-action/main/.gitlab-ci.yml"

upload-openapi-spec:
  extends: .upload-openapi-spec
  variables:
    STAINLESS_API_KEY: "$STAINLESS_API_KEY"
    INPUT_PATH: "$CI_PROJECT_DIR/path/to/my-company-openapi.json"
    PROJECT_NAME: "my-stainless-project"
    COMMIT_MESSAGE: "feat(api): my cool feature"
    GUESS_CONFIG: "true"
    # CONFIG_PATH: '$CI_PROJECT_DIR/path/to/my-company.stainless.yaml' # Optional
    # OUTPUT_PATH: '$CI_PROJECT_DIR/path/to/output.json' # Optional
    # BRANCH: 'main' # Optional
```

You can identify your Stainless project name on the [Stainless dashboard](https://app.stainless.com/).

### Optional parameters

- `branch`: Specifies the branch to push files to. If you provide it, the project MUST have the [branches
  feature](https://app.stainless.com/docs/guides/branches) enabled. By default, it is `main`.

- `commit_message`: Specifies the commit message that we will use for the commits generated for your SDKs as a result
  of the API change (and which will subsequently appear in the Changelog). If you provide it, it MUST follow the
  [Conventional Commits format](https://www.conventionalcommits.org/en/v1.0.0/). If you do not provide it, we will use a
  default message.

- `guess_config`: When `true`, will update your Stainless config file based on the change you've made to your spec. This
  does the same thing as selecting the "Generate missing endpoints" button in the Studio. By default, it is `false`. You
  should not set this to `true` if you are passing a `config_path`.

## Usage with ReadMe for docs with example snippets

If you sync an OpenAPI file to your [ReadMe API Reference](https://readme.com/), add the following to your Stainless config:

```yaml
openapi:
  code_samples: readme
```

### GitHub Actions with ReadMe

Configure your GitHub Action to upload the Stainless-enhanced OpenAPI spec to ReadMe:

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
          input_path: "path/to/my-company-openapi.json"
          output_path: "path/to/my-company-openapi.documented.json"
          project_name: "my-stainless-project"
          commit_message: "feat(api): my cool feature"
      - uses: readmeio/rdme@v8
        with:
          rdme: openapi "path/to/my-company-openapi.documented.json" --key=${{ secrets.README_TOKEN }} --id=${{ secrets.README_DEFINITION_ID }}
```

This assumes the following secrets have been [uploaded to your GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets):

- `secrets.STAINLESS_API_KEY`: Your Stainless API key.
- `secrets.README_TOKEN`: Your [ReadMe API key](https://docs.readme.com/main/reference/intro/authentication#api-key-quick-start). Only sent to ReadMe's servers.
- `secrets.README_DEFINITION_ID`: According to [ReadMe's documentation](https://docs.readme.com/main/docs/openapi-resyncing#api-definition-ids),
  this can be obtained by "clicking edit on the API definition on your project API definitions page". Only sent to ReadMe's servers.

Remember to set the `readmeio/rdme` ref version to the latest stable available (`v8`, as of this writing). You can verify the latest version of ReadMe's GitHub Action [here](https://github.com/marketplace/actions/rdme-sync-to-readme).

## Usage with Mintlify for docs with example snippets

If you use Mintlify's OpenAPI support for your API reference documentation,
add the following to your Stainless config:

```yaml
openapi:
  code_samples: mintlify
```

Mintlify can generate your docs based on the OpenAPI spec in your docs repo if it is [configured to do so](https://mintlify.com/docs/api-playground/openapi/setup#in-the-repo).

### GitHub Actions with Mintlify

To integrate Stainless with your GitHub Actions workflow:

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
      - name: Push spec and config to Stainless and output documented spec
        uses: stainless-api/upload-openapi-spec-action@main
        with:
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
          input_path: "path/to/my-company-openapi.json"
          output_path: "path/to/my-company-openapi.documented.json"
          project_name: "my-stainless-project"
          commit_message: "feat(api): my cool feature"
      - name: Push documented spec to docs repo
        uses: dmnemec/copy_file_to_another_repo_action@main
        env:
          API_TOKEN_GITHUB: ${{ secrets.API_TOKEN_GITHUB }}
        with:
          source_file: "path/to/my-company-openapi.documented.json"
          destination_repo: "{DOCS_REPO_NAME}"
          destination_folder: "openapi-specs" # (optional) the folder in the destination repository to place the file in, if not the root directory
          user_email: "{EMAIL}" # the email associated with the GH token
          user_name: "{USERNAME}" # the username associated with the GH token
          commit_message: "Auto-updates from Stainless"
```

This assumes the following secrets have been [uploaded to your GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets):

- `secrets.STAINLESS_API_KEY`: Your Stainless API key.
- `secrets.API_TOKEN_GITHUB`: A GitHub [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) with permissions to push to your docs repo.
