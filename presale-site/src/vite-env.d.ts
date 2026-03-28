/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRESALE_CHECKOUT_BASE_URL?: string;
  readonly VITE_PRESALE_DOMAIN?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
