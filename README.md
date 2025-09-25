# Are we attested yet? 🔏

A tracking site for npm package attestations, showing which of the top 500 most-downloaded npm packages have [SLSA provenance statements](https://slsa.dev/).

## What are attestations?

Attestations are cryptographically signed, publicly verifiable statements about npm packages that prove:

- Where the package was built (source repository)
- How it was built (CI/CD environment)
- When it was published

They use [Sigstore](https://sigstore.dev/) for keyless signing and are automatically generated when publishing from supported CI/CD platforms with [trusted publishers](https://docs.npmjs.com/trusted-publishers) or the `--provenance` flag.

## Inspired by

- [Are we PEP 740 yet?](https://trailofbits.github.io/are-we-pep740-yet/) - Python attestation tracking
- [Python Wheels](https://pythonwheels.com/) - Package adoption tracking

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
