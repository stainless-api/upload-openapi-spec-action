# decorate-spec

A GitHub action for generating a "decorated" openapi spec for readme.com. Will take your openapi spec and generate a file in the current working directory called `MY_COMPANY_NAME-openapi.documented.json`, where `MY_COMPANY_NAME` is your name.

## Setup

1. Copy the example from below into a GitHub workflow file (e.g. `.github/workflows/decorate.yml`)
2. Replace `MY_COMPANY_NAME` with your company's name
3. Replace `PATH_TO_SPEC` with the path to your openapi spec (relative to the root of the repo).
4. Add [GitHub actions secrets storing your credentials](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
   - `secrets.STAINLESS_CONTAINER_TOKEN`: This is the GitHub token we gave you (e.g. `ghp_123abc`). If you did not receive one, reach out to your contact at Stainless.
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
      # docker login required for stainless-api/decorate-spec
      - uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: stainless-bot
          password: ${{ secrets.STAINLESS_CONTAINER_TOKEN }}
      - uses: stainless-api/decorate-spec@main
        with:
          MY_COMPANY_NAME: MY_COMPANY_NAME
          openapi_path: PATH_TO_SPEC
      - uses: readmeio/rdme
        with:
          rdme: openapi MY_COMPANY_NAME-openapi.documented.json --key=${{ secrets.README_TOKEN }} --id=${{ secrets.README_DEFINITION_ID }}
```
