# Example workflows

All workflows require you to provide your Stainless org and project names.

For authentication setup, see the [Authentication section](../README.md#authentication) in the main README.

## GitHub Actions

We recommend you use [push.yml](./push.yml). It has a single `build` job that runs when you create or update pull requests and when you push to your main branch.  It can also be triggered manually if needed.  For pull requests, the `build` job creates a build of your SDK using the changes that will be introduced by the pull request, then it adds a comment to the pull request with links to a GitHub diff and installation commands. For pushes to your main branch, the `build` job creates a build of the SDK with the pushed changes.

By default, the pull request workflow uses the title of the pull request as the commit message, but you can edit the comment on the pull request to change the commit message.

### API key authentication

If you prefer to authenticate with an API key instead of OIDC, use [pull_request_api_key.yml](./pull_request_api_key.yml).

### Fork pull requests

If you need workflows to run on pull requests from forks (common for open source projects), use [pull_request_forks.yml](./pull_request_forks.yml). This workflow uses `pull_request_target` instead of `pull_request`, which runs with the workflow definition from your base branch and has access to OIDC tokens.

The workflow explicitly checks out the PR's code to read the OpenAPI spec. This is safe because the action only reads spec files — it doesn't execute any code from the PR.

**Important:** For public repositories, configure GitHub to require approval for fork PR workflows. Go to **Settings** → **Actions** → **General**, and under "Fork pull request workflows from outside collaborators", select **"Require approval for all outside collaborators"**.

### Generated OpenAPI specs

If your OpenAPI spec is generated from your GitHub repo, via a shell script or other GitHub action, you will need to do some extra setup. This is because the action needs access to both the old OpenAPI spec and the new OpenAPI spec. See the example at [pull_request_generated.yml](./pull_request_generated.yml).

Here, `checkout-pr-ref` will checkout the relevant base Git commit. The first command runs against the base Git commit, generating the old OpenAPI spec. Then, `checkout-pr-ref` will checkout the relevant head Git commit. The second command runs against the head Git commit, generating the new OpenAPI spec. These steps are conditioned on pull request events; on pushes to your main branch, only the current spec is needed.

### Using SDK build outputs

If you want to install and test SDK builds as part of your workflow, see [pull_request_sdk_usage.yml](./pull_request_sdk_usage.yml). This example demonstrates how to extract the `install_url` from the build outputs and use it to install the SDK for integration testing.

## GitLab CI

For GitLab projects, add the configuration from [push_gitlab.yml](./push_gitlab.yml) to your `.gitlab-ci.yml` file. The workflow uses a single `build-sdk` job that runs on merge requests and pushes to your main branch.

If your OpenAPI spec is in a GitLab repo, see [merge_request_gitlab_generated.yml](./merge_request_gitlab_generated.yml) for additional instructions.

## Integration with docs platforms

If your Stainless config has code samples configured, the `build` action also outputs a `documented_spec_path` containing a path to a version of your OpenAPI spec with SDK code samples included.

If you sync your OpenAPI spec with a [ReadMe API Reference](https://readme.com/), use the [Sync to ReadMe](https://github.com/marketplace/actions/rdme-sync-to-readme) GitHub action to upload the documented spec to ReadMe. We have examples in the [push_readme.yml](./push_readme.yml) file.

If you use [Mintlify's OpenAPI support](https://mintlify.com/docs/api-playground/openapi-setup#in-the-repo) for your API reference documentation, copy the documented spec to your Mintlify docs repo to update it. We have examples in the [push_mintlify.yml](./push_mintlify.yml) file.

## Spec preparation

If your OpenAPI spec needs transformation before building SDKs, you can use the preparation actions.

### Combining multiple specs

If your API is split across multiple OpenAPI spec files, use the `prepare/combine` action to merge them into a single file before building SDKs. See [prepare_combine.yml](./prepare_combine.yml) for an example.

The action uses [Redocly CLI](https://redocly.com/docs/cli/) to combine specs, handling reference resolution and path merging. You can also configure how server URLs are handled when combining specs from different services.

### Converting Swagger 2.0 specs

If you have a Swagger 2.0 spec, use the `prepare/swagger` action to convert it to OpenAPI 3.x format. See [prepare_swagger.yml](./prepare_swagger.yml) for an example.
