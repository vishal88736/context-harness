Canopy is a local coding workspace with an independent, inspectable context for every conversation.

- Choose files, folders, instructions, previous chats, memories, attachments, and tool permissions.
- Preview the assembled request and inspect source inclusion, exclusions, and token estimates.
- Switch supported providers while retaining your conversation and selected context.
- Browse and edit your projects, review diffs, and approve agent actions explicitly.
- Keep conversations and provider settings on your machine.

Extract the package and run **Launch Canopy.command**. The interface opens in your browser; the application and its data stay local. Connect your own supported provider or local model. Selected context is transmitted to that provider.

Packages include their Node.js runtime and runtime dependencies. Linux x64, macOS Apple silicon, and macOS Intel are separate build targets. Check the release workflow for the platforms actually verified and compare the archive with its `.sha256` file before running it. Native Windows terminal execution is unsupported.

The [2026-11-05 artifact-only run](https://github.com/vishal88736/context-harness/actions/runs/41916960280) verified all three targets at `6a788c0`, including actual extracted-app startup, conversation persistence after restart, and occupied-port rejection. It did not publish a public release or deploy the website. Later releases need their own matching workflow results.

These are portable local apps, not signed native installers. Approved local shell commands run with your OS account's access. Tool permissions and reviews remain important.

Live-model validation was deliberately skipped at the owner's request. Protocol, browser, persistence, backup, and package tests have separate evidence in the repository's verification record.
