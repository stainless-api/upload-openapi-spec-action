# upload-spec

[![lint](https://github.com/stainless-api/upload-openapi-spec-action/actions/workflows/lint.yml/badge.svg)](https://github.com/stainless-api/upload-openapi-spec-action/actions/workflows/lint.yml)
[![build](https://github.com/stainless-api/upload-openapi-spec-action/actions/workflows/build.yml/badge.svg)](https://github.com/stainless-apiupload-openapi-spec-action/actions/workflows/build.yml)

A GitHub action for pushing your OpenAPI spec to Stainless to trigger regeneration of your SDKs. 

Note that there is currently a manual step in between this action and automatic creation of your PR's, 
and more manual steps before they are merged and released.

If your account is configured to do so, this action can also output a copy of your OpenAPI spec decorated with sample code snippets,
so that your API reference documentation can show examples of making each request with the user's chosen SDK 
(e.g., show `client.items.list()` instead of `curl https://api.my-company.com/items`). 

## Example usage

First, obtain an API Key from Stainless, and [add it to your GitHub actions secrets](https://docs.github.com/actions/security-guides/encrypted-secrets%23creating-encrypted-secrets-for-a-repository?tool=cli#creating-encrypted-secrets-for-a-repository) as `STAINLESS_API_KEY`:

```
gh secret set STAINLESS_API_KEY
```

Then, add a new workflow file, or add the action to an existing workflow:

```yaml
name: Upload OpenAPI spec to Stainless

on:
  push:
    branches: [main]
      
jobs:
  stainless:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: stainless-api/decorate-spec@main
        with:
          input_path: "path/to/my-company-openapi.json"
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
```

## Usage with ReadMe.com

If you use ReadMe's OpenAPI support for your API reference documentation, 
ask your contact at Stainless to configure sample code decoration for ReadMe, 
and then:

```yaml
name: Upload OpenAPI spec to Stainless and ReadMe

on:
  push:
    branches: [main]
      
jobs:
  stainless:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: stainless-api/decorate-spec@main
        with:
          input_path: "path/to/my-company-openapi.json"
          output_path: "path/to/my-company-openapi.documented.json"
          stainless_api_key: ${{ secrets.STAINLESS_API_KEY }}
      - uses: readmeio/rdme
        with:
          rdme: openapi "path/to/my-company-openapi.documented.json" --key=${{ secrets.README_TOKEN }} --id=${{ secrets.README_DEFINITION_ID }}
```

This assumes the following secrets have been [uploaded to your Github Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets):

   - `secrets.STAINLESS_API_KEY`: Your Stainless API key.
   - `secrets.README_TOKEN`: Your API token for readme.com. Only sent to ReadMe's servers.
   - `secrets.README_DEFINITION_ID`: According to [ReadMe's documentation](https://docs.readme.com/docs/openapi#re-syncing-an-openapi-document), 
      this can be obtained by "clicking edit on the API definition on your project API definitions page". Only sent to ReadMe's servers.
