/**
 * The DSH client module table: the packages a static client half gets from
 * its factory's `require` (rc.3 dsh-web-frontend `OZ()`,
 * docs/DEVELOPMENT.md §5.6). scripts/build-ui.mjs keeps them external;
 * scripts/preflight-bundle.mjs refuses a client half that requires anything else.
 */
export const MODULE_TABLE = Object.freeze([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])
