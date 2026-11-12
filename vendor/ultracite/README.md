# Ultracite Biome presets

Byte-identical core, Astro and Vitest presets from the published `ultracite`
7.12.4 package, MIT licensed. Upstream source commit:
`de9b41538822b189795539d5bd2d920edf7db52c` in
<https://github.com/haydenbleasel/ultracite>. The upstream license is retained here.

This snapshot keeps the existing rule set without installing the Ultracite CLI
and its unpatched `deepmerge` dependency. The upstream CLI's Biome check mode
runs `biome check --no-errors-on-unmatched` with the supplied files. The local
`lint` script invokes that same command and the same pinned Biome version.
Update these presets intentionally from a reviewed upstream release.
