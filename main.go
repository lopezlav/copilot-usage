package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type UsageItem struct {
	GrossQuantity float64 `json:"grossQuantity"`
	Model         string  `json:"model"`
}

type UsageResponse struct {
	UsageItems []UsageItem `json:"usageItems"`
}

const version = "1.0.0"

var plans = map[string]int{
	"free":       50,
	"pro":        300,
	"pro+":       1500,
	"business":   300,
	"enterprise": 1000,
}

func main() {
	var (
		planFlag    = flag.String("plan", "", "Copilot plan (free, pro, pro+, business, enterprise)")
		limitFlag   = flag.Int("limit", 0, "Custom request limit")
		jsonFlag    = flag.Bool("json", false, "Output JSON")
		helpFlag    = flag.Bool("help", false, "Show help")
		versionFlag = flag.Bool("version", false, "Show version")
	)
	flag.Parse()

	if *versionFlag {
		fmt.Println("copilot-usage", version, "(Go)")
		return
	}

	if *helpFlag {
		showHelp()
		return
	}

	plan := getPlan(*planFlag)
	limit := getLimit(*limitFlag, plan)

	username := getUsername()
	usage := fetchUsage(username)

	totalUsage := calculateTotalUsage(usage.UsageItems)
	percentage := (totalUsage / float64(limit)) * 100

	if *jsonFlag {
		outputJSON(username, plan, limit, totalUsage, percentage, usage.UsageItems)
		return
	}

	printBox(username, plan, limit, totalUsage, percentage, usage.UsageItems)
}

func showHelp() {
	fmt.Println(`copilot-usage

Get your GitHub Copilot premium request usage from the CLI.

Usage:
  copilot-usage [flags]

Flags:
  -plan string    Copilot plan (free, pro, pro+, business, enterprise)
  -limit int      Custom request limit
  -json           Output JSON
  -version        Show version
  -help           Show help

Environment:
  GH_COPILOT_PLAN   Default plan
  GH_COPILOT_LIMIT  Default limit`)
}

func getPlan(cliPlan string) string {
	if cliPlan != "" {
		return cliPlan
	}
	if envPlan := os.Getenv("GH_COPILOT_PLAN"); envPlan != "" {
		if _, ok := plans[envPlan]; ok {
			return envPlan
		}
	}
	return "pro+"
}

func getLimit(cliLimit int, plan string) int {
	if cliLimit > 0 {
		return cliLimit
	}
	if envLimit := os.Getenv("GH_COPILOT_LIMIT"); envLimit != "" {
		if parsed, err := strconv.Atoi(envLimit); err == nil && parsed > 0 {
			return parsed
		}
	}
	if limit, ok := plans[plan]; ok {
		return limit
	}
	return 1500
}

func getUsername() string {
	cmd := exec.Command("gh", "api", "/user", "-q", ".login")
	out, err := cmd.Output()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error: Could not get username. Is gh CLI authenticated?")
		os.Exit(1)
	}
	return strings.TrimSpace(string(out))
}

func fetchUsage(username string) UsageResponse {
	now := time.Now()
	year := now.Year()
	month := int(now.Month())

	endpoint := fmt.Sprintf("/users/%s/settings/billing/premium_request/usage?year=%d&month=%d", username, year, month)
	cmd := exec.Command("gh", "api", endpoint)
	out, err := cmd.Output()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error fetching usage:", err)
		os.Exit(1)
	}

	var usage UsageResponse
	if err := json.Unmarshal(out, &usage); err != nil {
		fmt.Fprintln(os.Stderr, "Error parsing response:", err)
		os.Exit(1)
	}

	return usage
}

func calculateTotalUsage(items []UsageItem) float64 {
	var total float64
	for _, item := range items {
		total += item.GrossQuantity
	}
	return total
}

func outputJSON(username, plan string, limit int, used, percentage float64, items []UsageItem) {
	modelCounts := make(map[string]float64)
	for _, item := range items {
		modelCounts[item.Model] += item.GrossQuantity
	}

	now := time.Now()
	result := map[string]interface{}{
		"username":   username,
		"plan":       plan,
		"limit":      limit,
		"used":       used,
		"percentage": fmt.Sprintf("%.1f", percentage),
		"month":      now.Format("January 2006"),
		"models":     modelCounts,
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(result)
}

func printBox(username, plan string, limit int, used, percentage float64, items []UsageItem) {
	now := time.Now()
	monthName := now.Format("January 2006")
	title := fmt.Sprintf("GitHub Copilot %s - Premium Requests", capitalize(plan))

	width := 58
	innerWidth := width - 2

	fmt.Println("┌" + strings.Repeat("─", width) + "┐")
	fmt.Println("│" + center("", innerWidth) + "│")
	fmt.Println("│" + center(title, innerWidth) + "│")
	fmt.Println("│" + center(monthName+" • "+username, innerWidth) + "│")
	fmt.Println("│" + center("", innerWidth) + "│")
	fmt.Println("├" + strings.Repeat("─", width) + "├")

	usageStr := fmt.Sprintf("Overall:  %d/%d (%.1f%%)", int(used), limit, percentage)
	fmt.Println("│ " + padRight(usageStr, innerWidth-1) + "│")

	bar := drawBar(used, float64(limit), innerWidth-9)
	fmt.Println("│ Usage:  " + bar + "│")
	fmt.Println("│" + center("", innerWidth) + "│")

	nextMonth := now.AddDate(0, 1, 0)
	resetStr := fmt.Sprintf("Resets: %s 1, %d at 00:00 UTC", nextMonth.Format("January"), nextMonth.Year())
	fmt.Println("│ " + padRight(resetStr, innerWidth-1) + "│")
	fmt.Println("├" + strings.Repeat("─", width) + "├")
	fmt.Println("│ " + padRight("Per-model usage:", innerWidth-1) + "│")
	fmt.Println("│" + center("", innerWidth) + "│")

	modelCounts := make(map[string]float64)
	for _, item := range items {
		modelCounts[item.Model] += item.GrossQuantity
	}

	if len(modelCounts) == 0 {
		fmt.Println("│ " + padRight("No premium requests used yet.", innerWidth-1) + "│")
	} else {
		for model, count := range modelCounts {
			if count == 0 {
				continue
			}
			modelPct := (count / float64(limit)) * 100
			line := fmt.Sprintf("%-22s %5d %6.1f%%", model, int(count), modelPct)
			fmt.Println("│ " + padRight(line, innerWidth-1) + "│")
		}
	}

	fmt.Println("│" + center("", innerWidth) + "│")
	fmt.Println("└" + strings.Repeat("─", width) + "┘")
}

func drawBar(used, total float64, width int) string {
	filled := int((used / total) * float64(width))
	if filled > width {
		filled = width
	}
	empty := width - filled
	return strings.Repeat("█", filled) + strings.Repeat("░", empty)
}

func center(s string, width int) string {
	if len(s) >= width {
		return s[:width]
	}
	padding := (width - len(s)) / 2
	return strings.Repeat(" ", padding) + s + strings.Repeat(" ", width-len(s)-padding)
}

func padRight(s string, width int) string {
	if len(s) >= width {
		return s[:width]
	}
	return s + strings.Repeat(" ", width-len(s))
}

func capitalize(s string) string {
	if len(s) == 0 {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
