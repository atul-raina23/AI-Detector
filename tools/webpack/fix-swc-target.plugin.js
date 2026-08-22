/**
 * NxAppWebpackPlugin's swc-loader options are hardcoded internally with no
 * `jsc.target` set (see @nx/webpack's compiler-loaders.js) — SWC then
 * defaults to a pre-ES2015 target, which down-levels `class X extends Y`
 * into old `Y.call(this)`-style inheritance. That breaks at runtime for
 * any real ES6 class from an external package (e.g. sequelize-typescript's
 * `Model`): "Class constructor X cannot be invoked without 'new'".
 *
 * Webpack applies plugins in array order, so placed AFTER NxAppWebpackPlugin
 * in the `plugins` list, this patches the swc-loader rule it already
 * injected — the rule exists on `compiler.options.module.rules` by the time
 * our `apply()` runs.
 */
class FixSwcTargetPlugin {
  apply(compiler) {
    const rules = compiler.options.module?.rules ?? [];
    for (const rule of rules) {
      if (
        rule &&
        typeof rule === 'object' &&
        typeof rule.loader === 'string' &&
        rule.loader.includes('swc-loader')
      ) {
        rule.options = rule.options ?? {};
        rule.options.jsc = rule.options.jsc ?? {};
        rule.options.jsc.target = 'es2022';
      }
    }
  }
}

module.exports = { FixSwcTargetPlugin };
