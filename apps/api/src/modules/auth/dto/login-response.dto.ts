export class TenantOption {
  id: string;
  name: string;
}

export class LoginResponseDto {
  accessToken?: string;
  tenants?: TenantOption[];
}
