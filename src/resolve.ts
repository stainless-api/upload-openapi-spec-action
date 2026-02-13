import type Stainless from "@stainless-api/sdk";
import { logger } from "./logger";

export async function resolveProject(
  client: Stainless,
  projectInput: string | undefined,
): Promise<{ projectName: string; orgName: string | undefined }> {
  if (projectInput) {
    return { projectName: projectInput, orgName: undefined };
  }

  const page = await client.projects.list({ limit: 6 });
  const projects = page.data;

  if (projects.length === 0) {
    throw new Error(
      "No projects found for the given API key. Please specify the `project` input explicitly.",
    );
  }

  if (projects.length === 1) {
    const project = projects[0];
    logger.info(`Auto-detected project: ${project.slug}`);
    return { projectName: project.slug, orgName: project.org };
  }

  const slugs = projects
    .slice(0, 5)
    .map((p) => p.slug)
    .join(", ");
  const suffix = projects.length > 5 ? ", ..." : "";
  throw new Error(
    `Multiple projects found: ${slugs}${suffix}. Please specify the \`project\` input explicitly.`,
  );
}

export async function resolveOrg(
  client: Stainless,
  orgName: string | undefined,
): Promise<string> {
  if (orgName) {
    return orgName;
  }

  const project = await client.projects.retrieve();
  logger.info(`Auto-detected org: ${project.org}`);
  return project.org;
}
