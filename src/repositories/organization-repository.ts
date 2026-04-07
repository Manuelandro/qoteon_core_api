import {
  CreateOrganizationInput,
  Organization,
  OrganizationRole,
  OrganizationUser,
} from "../domain/core";

export interface AddOrganizationUserInput {
  organization_id: string;
  user_id: string;
  org_role: OrganizationRole;
}

export interface OrganizationRepository {
  create_organization(input: CreateOrganizationInput): Promise<Organization>;
  get_organization_by_id(organization_id: string): Promise<Organization | null>;
  list_organizations_for_user(user_id: string): Promise<Organization[]>;
  add_user_to_organization(input: AddOrganizationUserInput): Promise<OrganizationUser>;
  get_membership(organization_id: string, user_id: string): Promise<OrganizationUser | null>;
}
