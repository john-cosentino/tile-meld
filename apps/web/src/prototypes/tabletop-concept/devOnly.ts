// Single source of truth for whether the static concept-art prototype
// route exists at all. `import.meta.env.DEV` is Vite's build-time
// constant -- `true` under the dev server, `false` (and dead-code-
// eliminable) in `vite build`'s production bundle. Exported as its own
// tiny module (rather than inlined in App.tsx) so a test can mock just
// this one value and exercise the "route disabled" branch without faking
// Vite's env machinery directly -- see
// apps/web/test/prototypeRouteGuard.test.tsx.
export const PROTOTYPE_ROUTE_ENABLED = import.meta.env.DEV;
