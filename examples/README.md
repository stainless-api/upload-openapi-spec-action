# Example workflows

There's two kinds of workflows, depending on how you manage your GitHub repo. Both workflows require you to:

* Provide your Stainless org and project names, as well as a Stainless API key.

* Have a consistent path to an OpenAPI spec in your repo contents.

* Provide a commit message, preferably in [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format. (Commit messages that aren't in the Conventional Commits format will have `feat:` prepended to them.)

## Pull request workflows

The main kind of workflows are the pull-request-based workflows, such as [pull_request.yml](./pull_request.yml). If all changes to your OpenAPI spec are made via pull requests, we recommend using this workflow. It has two jobs:

* `preview`, which runs when a pull request is opened or updated. The job creates a build of your SDK which includes only the changes introduced by the pull request. It also makes a comment on the pull request, with links to a GitHub diff, and installation commands for trying out your SDK.

* `merge`, which runs when a pull request is merged. The job creates a build of the SDK with the changes from the pull request, along with any [custom code](https://app.stainless.com/docs/guides/patch-custom-code#project-branches) added to the preview build.

By default, the pull request workflow uses the title of the pull request as the commit message.

## Push workflows

The other kind of workflows are the push-based workflows, such as [push.yml](./push.yml). If for some reason you can't use the pull-request-based workflows, you can use this workflow. It has one job:

* `build`, which runs when a commit is pushed to a branch you specify. The job creates a build of your SDK against the latest commit on that branch.

By default, the push workflow uses the same commit message.

## Integration with docs platforms

If your Stainless config has code samples configured, the `merge` and `build` actions also output a `documented_spec_path` containing a path to your OpenAPI spec with SDK code samples.

If you sync your OpenAPI spec with a [ReadMe API Reference](https://readme.com/), you can use the [Sync to ReadMe](https://github.com/marketplace/actions/rdme-sync-to-readme) GitHub action to upload the documented spec to ReadMe. You can see examples of this in the [pull_request_readme.yml](./pull_request_readme.yml) and [push_readme.yml](./push_readme.yml) files.

If you use [Mintlify's OpenAPI support](https://mintlify.com/docs/api-playground/openapi-setup#in-the-repo) for your API reference doucmentation, you can copy the documented spec to your Mintlify docs repo to update it. You can see examples of this in the [pull_request_mintlify.yml](./pull_request_mintlify.yml) and [push_mintlify.yml](./push_mintlify.yml) files.
