# copilot-usage

Get your GitHub Copilot premium request usage from the CLI.

Shows the same percentage you see in GitHub Settings → Copilot → Features.

## Install

```bash
go build -ldflags="-s -w" -o copilot-usage .
mv copilot-usage ~/.local/bin/
```

## Usage

### CLI

```bash
copilot-usage              # Default: Pro+ plan (1500 requests)
copilot-usage -plan pro    # Use Pro plan (300 requests)
copilot-usage -limit 500   # Use custom limit
copilot-usage -json        # Output JSON
copilot-usage -help        # Show help
```

### i3 Status Bar

Add Copilot usage as the first element in your i3 status bar:

```bash
# ~/.config/i3/config
bar {
    status_command copilot-usage -i3bar
    tray_output primary
}
```

Then reload i3:
```bash
i3-msg reload
```

Your bar will show:
```
Copilot: ███████░░░ 73.9% | WiFi: 63% | FULL 87.56% | ...
```

The bar updates every 60 seconds and includes all your regular i3status modules.

## Requirements

- GitHub CLI (`gh`) installed and authenticated
- Go (for building)
- i3status (for status bar integration)
