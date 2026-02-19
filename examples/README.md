# Example workflows

There's two kinds of workflows, depending on how you manage your GitHub repo. Both workflows require you to provide your Stainless org and project names.

For authentication setup, see the [Authentication section](../README.md#authentication) in the main README.

## Pull request workflows

The main kind of workflows are the pull-request-based workflows, such as [pull_request.yml](./pull_request.yml). If all changes to your OpenAPI spec are made via pull requests, we recommend using this workflow. It has two jobs:

- `preview`, which runs when a pull request is opened or updated. The job creates a build of your SDK which includes only the changes introduced by the pull request. It also makes a comment on the pull request, with links to a GitHub diff, and installation commands for trying out your SDK.

- `merge`, which runs when a pull request is merged. The job creates a build of the SDK with the changes from the pull request, along with any [custom code](https://app.stainless.com/docs/guides/patch-custom-code#project-branches) added to the preview build.

By default, the pull request workflow uses the title of the pull request as the commit message, but you can edit the comment on the pull request to change the commit message.

### Fork pull requests

If you need workflows to run on pull requests from forks (common for open source projects), use [pull_request_forks.yml](./pull_request_forks.yml). This workflow uses `pull_request_target` instead of `pull_request`, which runs with the workflow definition from your base branch and has access to OIDC tokens.

The workflow explicitly checks out the PR's code to read the OpenAPI spec. This is safe because the action only reads spec files — it doesn't execute any code from the PR.

**Important:** For public repositories, configure GitHub to require approval for fork PR workflows. Go to **Settings** → **Actions** → **General**, and under "Fork pull request workflows from outside collaborators", select **"Require approval for all outside collaborators"**.

### Generated OpenAPI specs

If your OpenAPI spec is generated from your GitHub repo, via a shell script or other GitHub action, you will need to do some extra setup. This is because the action needs access to both the old OpenAPI spec and the new OpenAPI spec. See the example at [pull_request_generated.yml](./pull_request_generated.yml).

Here, `checkout-pr-ref` will checkout the relevant base Git commit. The first command runs against the base Git commit, generating the old OpenAPI spec. Then, `checkout-pr-ref` will checkout the relevant head Git commit. The second command runs against the head Git commit, generating the new OpenAPI spec.

## Push workflows

The other kind of workflows are the push-based workflows, such as [push.yml](./push.yml). If for some reason you can't use the pull-request-based workflows, you can use this workflow. It has one job:

- `build`, which runs when a commit is pushed to a branch you specify. The job creates a build of your SDK against the latest commit on that branch.

In the examples, the push workflow is configured to use a generic commit message. You can change this to the message of the pushed commit by using `${{ github.event.head_commit.message }}`.

## Integration with docs platforms

If your Stainless config has code samples configured, the `preview`, `merge`, and `build` actions also output a `documented_spec_path` containing a path to your OpenAPI spec with SDK code samples.

If you sync your OpenAPI spec with a [ReadMe API Reference](https://readme.com/), you can use the [Sync to ReadMe](https://github.com/marketplace/actions/rdme-sync-to-readme) GitHub action to upload the documented spec to ReadMe. You can see examples of this in the [pull_request_readme.yml](./pull_request_readme.yml) and [push_readme.yml](./push_readme.yml) files.

If you use [Mintlify's OpenAPI support](https://mintlify.com/docs/api-playground/openapi-setup#in-the-repo) for your API reference documentation, you can copy the documented spec to your Mintlify docs repo to update it. You can see examples of this in the [pull_request_mintlify.yml](./pull_request_mintlify.yml) and [push_mintlify.yml](./push_mintlify.yml) files.

## Spec preparation

If your OpenAPI spec needs transformation before building SDKs, you can use the preparation actions.

### Combining multiple specs

If your API is split across multiple OpenAPI spec files, use the `prepare/combine` action to merge them into a single file before building SDKs. See [prepare_combine.yml](./prepare_combine.yml) for an example.

The action uses [Redocly CLI](https://redocly.com/docs/cli/) to combine specs, handling reference resolution and path merging. You can also configure how server URLs are handled when combining specs from different services.

When specs share `operationId` values, the action automatically prefixes conflicting IDs with a slug derived from each spec's `info.title` to avoid collisions during the combine. You can also set `prefix_with_info: true` to prefix tags and component names with each spec's title, which helps avoid collisions when multiple specs define tags or components with the same names.

### Converting Swagger 2.0 specs

If you have a Swagger 2.0 spec, use the `prepare/swagger` action to convert it to OpenAPI 3.x format. See [prepare_swagger.yml](./prepare_swagger.yml) for an example.
