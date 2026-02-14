# Copilot Instructions for are-we-attested-yet

## Project Overview

A static site tracking SLSA provenance attestations for the top 500 npm packages. Shows which packages have cryptographically verifiable build provenance via [Sigstore](https://sigstore.dev/).

## Architecture

```
src/index.mts     → Data fetcher (generates output.json)
output.json       → Package attestation data (generated, not committed)
index.html        → Static frontend (loads output.json client-side)
server.mjs         → Simple dev server (port 8081)
```

**Data flow**: Ecosyste.ms API → npm registry → `output.json` → browser

## Developer Workflows

```bash
# Install dependencies
pnpm install

# Generate attestation data (fetches from npm, takes ~5 minutes)
pnpm start

# Local development (after generating output.json)
node server.mjs  # Visit http://localhost:8081

# Format code
pnpm run format
```

## TypeScript Configuration

- Uses Node's native TypeScript execution (`.mts` extension)
- Requires **Node 22+** and **pnpm 10+**
- Strict TypeScript config via `@tsconfig/strictest`
- No build step needed - Node runs TypeScript directly

## Code Style (Biome)

- **Formatter**: Spaces for indentation, double quotes for strings
- **Linter**: Recommended rules enabled, `useLiteralKeys` disabled for bracket notation
- Run `pnpm run format` before committing

## Key Implementation Details

### Attestation Logic ([src/index.mts](../src/index.mts))

Packages are categorized by:
- `attestationsUrl` present → Has SLSA provenance (green/🔏)
- `trustedPublisherId` present → Uses npm trusted publishers
- `isSupportedPlatform` (GitHub/GitLab only) → Can potentially have attestations
- `lastUploaded` before April 19, 2023 → Predates attestation support (grey/⏰)

### Frontend ([index.html](../index.html))

- Uses **Tailwind CSS v4** via CDN (no build step)
- Dark mode via `prefers-color-scheme`
- Stats circle uses CSS `conic-gradient` with dynamic `--success-deg` and `--warning-deg` variables

## External APIs

| API | Purpose | Rate limiting |
|-----|---------|---------------|
| `packages.ecosyste.ms` | Top npm packages by downloads | 500ms delay between pages |
| `registry.npmjs.org` | Package metadata + attestations | 1s delay per 10-package batch |

## CI/CD ([.github/workflows/build.yml](workflows/build.yml))

- **Triggers**: Push to `main`, daily at midnight UTC, manual dispatch
- **Process**: `pnpm install` → `pnpm start` (generates `output.json`) → deploy to GitHub Pages
- **Deployed files**: `index.html`, `styles.css`, `output.json` only
- **Note**: `output.json` is regenerated fresh on each deployment, never committed

## File Patterns

- `*.mts` - TypeScript modules (executed directly by Node)
- `*.js` - CommonJS (server only)
- No test files currently exist
