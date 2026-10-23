# Security Policy

PKU Harness stores campus credentials, the IAAA authenticator secret and AI provider keys on the
user's phone, and lets an AI assistant act on campus services for the user. We take security
reports seriously.

## Supported versions

Security fixes go into the latest release and the `master` branch. JavaScript fixes reach
installed apps through signed over-the-air updates; native fixes ship as a new signed APK.

## Reporting a vulnerability

**Please don't open a public issue.** Use GitHub's private vulnerability reporting:
[Security → Report a vulnerability](https://github.com/pkuinfo/pku-harness/security/advisories/new).
Issues that concern a plugin or the cloud server go to
[pku-harness-plugins](https://github.com/pkuinfo/pku-harness-plugins/security/advisories/new).

Please include the affected area, steps to reproduce, the version or commit, and how severe you
think it is. **Never include real accounts, passwords, tokens or personal data**: use test data
or redact them.

We acknowledge reports within 7 days and credit you in the release notes once fixed, if you wish.

## In scope

- Credential leaks: passwords, authenticator secrets, cookies or API keys outside SecureStore
  (logs, exported data, crash reports, network requests).
- Plugins exceeding their declared access: reaching sessions or credentials that aren't theirs,
  or bypassing the per-effect permissions (read, change, money, public).
- Prompt injection: campus content (Treehole posts, notices, …) steering the assistant into
  actions the user didn't authorise.
- Payments or public posts executed without the required confirmation.
- The cloud relay or store revealing plaintext, or linking users across plugins.
- Over-the-air updates or release APKs that could be served or installed without a valid
  signature.
- Supply-chain issues in remote (MCP) plugins, plugin documents or the marketplace registry.

## Out of scope

- Vulnerabilities in the university's own services. Please contact the responsible university
  department.
- Attacks that need a rooted or jailbroken device, or physical access to an unlocked phone.
