# copilot-usage

Get your GitHub Copilot premium request usage from the CLI.

Shows the same percentage you see in GitHub Settings → Copilot → Features.

## Install

```bash
bun build index.ts --compile --outfile copilot-usage
mv copilot-usage ~/.local/bin/
```

## Usage

```bash
copilot-usage              # Default: Pro+ plan (1500 requests)
copilot-usage --plan pro   # Use Pro plan (300 requests)
copilot-usage --limit 500  # Use custom limit
copilot-usage --json       # Output JSON
copilot-usage --help       # Show help
```

## Requirements

- GitHub CLI (`gh`) installed and authenticated
- Bun (for building)
