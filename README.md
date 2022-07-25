# decorate-spec

A GitHub action for generating a "decorated" openapi spec for readme.com. Will take your openapi spec and generate a file in the current working directory called `CUSTOMER-openapi.documented.json`, where `CUSTOMER` is your name.

## Setup

1. Copy the example from below into a GitHub workflow file (e.g. `.github/workflows/decorate.yml`)
2. Replace `CUSTOMER` with your company's name
3. Replace `PATH_TO_SPEC` with the relative path to your openapi spec. This path should be relative to the root of the repo.
4. Add [GitHub actions secrets storing your credentials](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
   - `secrets.STAINLESS_CONTAINER_TOKEN`: You should've been given a GitHub token, this should be called that.
   - `secrets.README_TOKEN`: Your API token for README.com.
   - `secrets.README_DEFINITION_ID`: According to readme's documentation can be obtained by "clicking edit on the API definition on your project API definitions page".

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
          customer: CUSTOMER
          openapi_path: PATH_TO_SPEC
      - uses: readmeio/rdme
        with:
          rdme: openapi CUSTOMER-openapi.documented.json --key=${{ secrets.README_TOKEN }} --id=${{ secrets.README_DEFINITION_ID }}
```
