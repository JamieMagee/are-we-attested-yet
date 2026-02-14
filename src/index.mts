import { writeFileSync } from "node:fs";
import { join } from "node:path";

interface EcosystemsPackage {
  name: string;
  repository_url: string | null;
  latest_release_number: string | null;
  latest_release_published_at: string | null;
}

interface NpmVersionMetadata {
  dist?: {
    attestations?: {
      url: string;
    };
  };
  _npmUser?: {
    trustedPublisher?: {
      id: string;
    };
  };
}

interface AttestationResult {
  name: string;
  version: string;
  lastUploaded: string;
  attestationsUrl: string;
  trustedPublisherId: string;
  repositoryUrl: string;
}

async function fetchWithRetry(
  url: string,
  retries: number = 3,
  baseDelay: number = 1000,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url);
    if (response.ok) {
      return response;
    }
    if (response.status >= 500 && attempt < retries) {
      const delay = baseDelay * 2 ** (attempt - 1);
      console.warn(
        `  ⚠️ HTTP ${response.status} on attempt ${attempt}/${retries}, retrying in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  throw new Error("Unreachable");
}

async function fetchTopNpmPackages(
  limit: number = 500,
): Promise<EcosystemsPackage[]> {
  const baseUrl = "https://packages.ecosyste.ms/api/v1";
  const registry = "npmjs.org";

  try {
    const perPage = 100; // API max per page
    const totalPages = Math.ceil(limit / perPage);
    const allPackages: EcosystemsPackage[] = [];

    console.log(
      `Fetching top ${limit} npm packages across ${totalPages} pages...`,
    );

    for (let page = 1; page <= totalPages; page++) {
      const url = `${baseUrl}/registries/${registry}/packages?per_page=${perPage}&page=${page}&order=desc&sort=downloads`;

      console.log(`Fetching page ${page}/${totalPages}...`);
      const response = await fetchWithRetry(url);
      const data = (await response.json()) as EcosystemsPackage[];
      console.log(`  Retrieved ${data.length} packages from page ${page}`);

      allPackages.push(...data);

      console.log(`  Total packages so far: ${allPackages.length}`);

      // If we have fewer packages than expected, we might have reached the end
      if (data.length < perPage) {
        console.log(`  Reached end of available packages at page ${page}`);
        break;
      }

      // If this is the last page, don't add delay
      if (page < totalPages) {
        console.log(`  Waiting 500ms before next request...`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return allPackages.slice(0, limit);
  } catch (error) {
    console.error("Error fetching packages:", error);
    throw error;
  }
}

function isSupportedPlatform(repositoryUrl: string): boolean {
  if (!repositoryUrl) {
    return false;
  }

  const url = repositoryUrl.toLowerCase();
  // Remove common prefixes and suffixes
  const cleanUrl = url.replace(/^git\+/, "").replace(/\.git$/, "");

  return cleanUrl.includes("github.com") || cleanUrl.includes("gitlab.com");
}

async function fetchPackageAttestation(
  pkg: EcosystemsPackage,
): Promise<AttestationResult | null> {
  const latestVersion = pkg.latest_release_number;

  if (!latestVersion) {
    console.log(`⏭️  Skipping ${pkg.name} (no latest version)`);
    return {
      name: pkg.name,
      version: "",
      lastUploaded: pkg.latest_release_published_at || "",
      attestationsUrl: "",
      trustedPublisherId: "",
      repositoryUrl: pkg.repository_url || "",
    };
  }

  try {
    console.log(`🔍 Checking attestations for ${pkg.name}@${latestVersion}...`);
    // Fetch only the specific version, not the full package document.
    // This is dramatically smaller (~1-5 KB vs potentially 1+ MB for
    // popular packages with many versions).
    const response = await fetchWithRetry(
      `https://registry.npmjs.org/${pkg.name}/${latestVersion}`,
    );

    const versionData = (await response.json()) as NpmVersionMetadata;
    const attestationsUrl = versionData.dist?.attestations?.url || "";
    const trustedPublisher = versionData._npmUser?.trustedPublisher?.id || "";

    return {
      name: pkg.name,
      version: latestVersion,
      lastUploaded: pkg.latest_release_published_at || "",
      attestationsUrl,
      trustedPublisherId: trustedPublisher,
      repositoryUrl: pkg.repository_url || "",
    };
  } catch (error) {
    console.error(`❌ Error checking attestations for ${pkg.name}:`, error);
    return null;
  }
}

async function main() {
  try {
    const topPackages = await fetchTopNpmPackages(500);

    console.log(
      `\n🔎 Checking attestations for ${topPackages.length} packages...`,
    );

    // Check attestations for each package in batches
    const attestationResults: AttestationResult[] = [];
    const batchSize = 10;

    for (let i = 0; i < topPackages.length; i += batchSize) {
      const batch = topPackages.slice(i, i + batchSize);
      const batchPromises = batch.map((pkg) => fetchPackageAttestation(pkg));
      const batchResults = await Promise.all(batchPromises);
      attestationResults.push(
        ...batchResults.filter((result) => result !== null),
      );

      // Add delay between batches
      if (i + batchSize < topPackages.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Create simplified output
    const packages = attestationResults.map((result, index) => ({
      rank: index + 1,
      package: result.name,
      version: result.version,
      lastUploaded: result.lastUploaded,
      attestationsUrl: result.attestationsUrl,
      trustedPublisherId: result.trustedPublisherId,
      repositoryUrl: result.repositoryUrl,
      isSupportedPlatform: isSupportedPlatform(result.repositoryUrl),
    }));

    // Calculate statistics
    const totalPackages = packages.length;
    const packagesWithAttestations = packages.filter(
      (pkg) => pkg.attestationsUrl !== "",
    ).length;

    const attestationPercentage = (
      (packagesWithAttestations / totalPackages) *
      100
    ).toFixed(1);

    // Write to JSON file
    const outputPath = join(process.cwd(), "output.json");
    const report = {
      generated_at: new Date().toISOString(),
      summary: {
        total_packages: totalPackages,
        packages_with_attestations: packagesWithAttestations,
        attestation_percentage: parseFloat(attestationPercentage),
      },
      packages,
    };

    writeFileSync(outputPath, JSON.stringify(report, null, 2));

    // Display results
    console.log("\n📊 SLSA Attestation Report for Top 500 npm Packages");
    console.log("=".repeat(60));
    console.log(`📦 Total packages checked: ${totalPackages}`);
    console.log(
      `📦 Packages with attestations: ${packagesWithAttestations} (${attestationPercentage}%)`,
    );

    console.log(`📄 Report saved to: ${outputPath}`);

    // Show examples
    const slsaPackages = packages.filter(
      (pkg) => pkg.attestationsUrl !== "" && pkg.trustedPublisherId !== "",
    );
    if (slsaPackages.length > 0) {
      console.log("\n🎉 Packages with SLSA attestations:");
      slsaPackages.slice(0, 10).forEach((pkg) => {
        console.log(`  ${pkg.rank}. ${pkg.package}`);
      });
    }

    const noAttestationPackages = packages.filter(
      (pkg) => pkg.attestationsUrl === "",
    );
    if (noAttestationPackages.length > 0) {
      console.log("\n⚠️  Packages WITHOUT attestations:");
      noAttestationPackages.slice(0, 10).forEach((pkg) => {
        console.log(`  ${pkg.rank}. ${pkg.package}`);
      });
    }
  } catch (error) {
    console.error("Failed to generate attestation report:", error);
    process.exit(1);
  }
}

// Run the tool
main();
