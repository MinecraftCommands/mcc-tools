/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
    webpack: (config) => {
        /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
        const svgLoaderRule = config.module.rules.find(( /** @type {any} */ rule) => rule.test?.test?.(".svg"));
        config.module.rules.push(
            // Reapply the existing rule, but only for svg imports ending in ?url
            {
                ...svgLoaderRule,
                test: /\.svg$/i,
                resourceQuery: /url/, // *.svg?url
            },
            // Convert all other *.svg imports to React components
            {
                test: /\.svg$/i,
                issuer: svgLoaderRule.issuer,
                resourceQuery: { not: [...svgLoaderRule.resourceQuery.not, /url/] }, // exclude if *.svg?url
                use: ['@svgr/webpack'],
            },
        )
    
        // Modify the file loader rule to ignore *.svg, since we have it handled now.
        svgLoaderRule.exclude = /\.svg$/i
    
        return config
        /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
    }
};

export default config;
