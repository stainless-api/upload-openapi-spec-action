# decorate-spec

[![lint](https://github.com/stainless-api/readme-action/actions/workflows/lint.yml/badge.svg)](https://github.com/stainless-api/readme-action/actions/workflows/lint.yml)
[![build](https://github.com/stainless-api/readme-action/actions/workflows/build.yml/badge.svg)](https://github.com/stainless-api/readme-action/actions/workflows/build.yml)

A GitHub action for generating a "decorated" openapi spec for readme.com. Will take your openapi spec and generate a file in the current working directory called `MY_COMPANY_NAME-openapi.documented.json`, where `MY_COMPANY_NAME` is your name.

## Setup

1. Copy the example from below into a GitHub workflow file (e.g. `.github/workflows/decorate.yml`)
2. Replace `INPUT_PATH` with the path to your openapi spec (relative to the root of the repo).
3. Replace `OUTPUT_PATH` with where you want the documented spec to be written (relative to the root of the repo). This file will be created for you.
4. Add [GitHub actions secrets storing your credentials](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
   - `secrets.STAINLESS_API_KEY`: Your Stainless API key.
   - `secrets.README_TOKEN`: Your API token for ReadMe.com. Only sent to readme's servers.
   - `secrets.README_DEFINITION_ID`: According to [ReadMe's documentation](https://docs.readme.com/docs/openapi#re-syncing-an-openapi-document), this can be obtained by "clicking edit on the API definition on your project API definitions page". Only sent to readme's servers.

## Example

```yaml
name: Decorate Specs

on: [push]

jobs:
  stainless:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: stainless-api/decorate-spec@main
        with:
          input_path: PATH_TO_OPENAPI_SPEC
          output_path: PATH_TO_DECORATED_SPEC
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
      - uses: readmeio/rdme
        with:
          rdme: openapi PATH_TO_DECORATED_SPEC --key=${{ secrets.README_TOKEN }} --id=${{ secrets.README_DEFINITION_ID }}
```
