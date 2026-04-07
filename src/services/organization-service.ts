import { AuthenticatedUser, Organization } from "../domain/core";
import { slugify } from "../lib/slug";
import { OrganizationRepository } from "../repositories/organization-repository";

export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
  plan_type: Organization["plan_type"];
}

export class OrganizationService {
  constructor(private readonly organization_repository: OrganizationRepository) {}

  async create_organization_for_user(
    user: AuthenticatedUser,
    input: CreateOrganizationRequest,
  ): Promise<Organization> {
    const organization = await this.organization_repository.create_organization({
      name: input.name,
      slug: input.slug ? slugify(input.slug) : slugify(input.name),
      plan_type: input.plan_type,
    });

    await this.organization_repository.add_user_to_organization({
      organization_id: organization.id,
      user_id: user.user_id,
      org_role: "owner",
    });

    return organization;
  }

  async list_organizations_for_user(user_id: string): Promise<Organization[]> {
    return this.organization_repository.list_organizations_for_user(user_id);
  }
}
