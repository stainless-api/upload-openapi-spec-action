# decorate-spec

A GitHub action for generating a "decorated" openapi spec for readme.com. Will take your openapi spec and stainless config and generate a file in the current working directory called `CUSTOMER-openapi.documented.json`, where `CUSTOMER` is your name.

## Example Usage

Here is an example GitHub action workflow that will use this action to generate the decorated openapi spec and then upload it to readme.com. This file should be stored in `.github/workflows/`

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
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: stainless-api/decorate-spec@main
      - uses: readmeio/rdme
        with:
          rdme: openapi CUSTOMER-openapi.documented.json --key=${{ secrets.README_TOKEN }} --id=${{ secrets.README_DEFINITION_ID }}
```

Once you replace `CUSTOMER` with your name you are going to want to add the required secrets. The `GITHUB_TOKEN` secret is already provided so you only need to add the `README_TOKEN` and `README_DEFINITION_ID` secrets. `README_TOKEN` is simply going to be a token that allows for open API spec uploads to readme.com. `README_DEFINITION_ID`, according to readme's documentation, can be obtained by "clicking edit on the API definition on your project API definitions page". More information on adding secrets can be found in [Github's documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets).
