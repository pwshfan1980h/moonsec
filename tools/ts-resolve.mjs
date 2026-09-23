// Node resolve hook: lets tool scripts import src/ modules, which use extensionless
// relative imports (bundler style). Tries `<specifier>.ts` when plain resolution fails.
// Used via tools/register-ts.mjs:  node --import ./tools/register-ts.mjs tools/rig/build.ts
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (relative && !/\.[cm]?[jt]s(on)?$/.test(specifier)) return next(`${specifier}.ts`, context);
    throw err;
  }
}
