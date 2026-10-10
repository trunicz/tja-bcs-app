/// <reference types="astro/client" />

interface UserLocal {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
  rolId: number;
  salaId: number | null;
  permisos: string[];
}

interface OriginalAdminLocal {
  id: number;
  nombre: string;
  correo?: string;
}

declare namespace App {
  interface Locals {
    user?: UserLocal | null;
    token?: string | null;
    isImpersonated?: boolean;
    originalAdmin?: OriginalAdminLocal | null;
  }
}
