#!/usr/bin/env bun

import { $ } from 'bun'
import { parseArgs } from 'node:util'

const PLANS: Record<string, number> = {
  free: 50,
  pro: 300,
  'pro+': 1500,
  business: 300,
  enterprise: 1000,
}

interface UsageItem {
  product: string
  sku: string
  model: string
  unitType: string
  pricePerUnit: number
  grossQuantity: number
  grossAmount: number
  discountQuantity: number
  discountAmount: number
  netQuantity: number
  netAmount: number
}

interface UsageResponse {
  timePeriod: {
    year: number
    month: number
  }
  user: string
  usageItems: UsageItem[]
}

function parseCliArgs(): { limit?: number; plan?: string; json?: boolean; help?: boolean } {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      plan: {
        type: 'string',
        short: 'p',
      },
      limit: {
        type: 'string',
        short: 'l',
      },
      json: {
        type: 'boolean',
        short: 'j',
      },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
    strict: true,
    allowPositionals: false,
  })

  if (values.help) {
    showHelp()
    process.exit(0)
  }

  let plan: string | undefined
  if (values.plan) {
    const planKey = values.plan.toLowerCase()
    if (!PLANS[planKey]) {
      console.error(`Error: Unknown plan "${values.plan}"`)
      console.error(`Valid plans: ${Object.keys(PLANS).join(', ')}`)
      process.exit(1)
    }
    plan = planKey
  }

  let limit: number | undefined
  if (values.limit) {
    const parsed = parseInt(values.limit, 10)
    if (isNaN(parsed) || parsed <= 0) {
      console.error('Error: --limit must be a positive number')
      process.exit(1)
    }
    limit = parsed
  }

  return { limit, plan, json: values.json }
}

function showHelp(): void {
  console.log(`
GitHub Copilot Premium Requests Usage

USAGE:
    copilot-usage [OPTIONS]

OPTIONS:
    -p, --plan <plan>     Set your Copilot plan (free, pro, pro+, business, enterprise)
    -l, --limit <number>  Set custom monthly premium request limit
    -j, --json            Output raw JSON data
    -h, --help            Show this help message

ENVIRONMENT VARIABLES:
    GH_COPILOT_PLAN       Default plan (free, pro, pro+, business, enterprise)
    GH_COPILOT_LIMIT      Default limit (overrides plan default)

EXAMPLES:
    copilot-usage                    # Show usage with auto-detected plan
    copilot-usage --plan pro+        # Use Pro+ plan (1500 requests)
    copilot-usage --limit 1500       # Use custom limit
    copilot-usage --json             # Output JSON
`)
}

function getPlan(cliPlan?: string): string {
  if (cliPlan) return cliPlan
  
  const envPlan = process.env.GH_COPILOT_PLAN?.toLowerCase()
  if (envPlan && PLANS[envPlan]) return envPlan
  
  return 'pro+'
}

function getLimit(cliLimit: number | undefined, plan: string): number {
  if (cliLimit !== undefined) return cliLimit
  
  const envLimit = process.env.GH_COPILOT_LIMIT
  if (envLimit) {
    const parsed = parseInt(envLimit, 10)
    if (!isNaN(parsed) && parsed > 0) return parsed
  }
  
  return PLANS[plan] ?? 1500
}

async function fetchUsage(username: string, year: number, month: number): Promise<UsageResponse> {
  try {
    const response = await $`gh api "/users/${username}/settings/billing/premium_request/usage?year=${year}&month=${month}"`.json()
    return response as UsageResponse
  } catch (error) {
    console.error('Error fetching usage data:', error)
    console.error('\nMake sure you have:')
    console.error('  1. gh CLI installed and authenticated')
    console.error('  2. A valid GitHub token with appropriate permissions')
    process.exit(1)
  }
}

async function getUsername(): Promise<string> {
  try {
    const response = await $`gh api /user -q .login`.text()
    return response.trim()
  } catch (error) {
    console.error('Error: Could not get current user. Make sure gh CLI is authenticated.')
    process.exit(1)
  }
}

function calculateTotalUsage(usageItems: UsageItem[]): number {
  return usageItems.reduce((sum, item) => sum + item.grossQuantity, 0)
}

function aggregateByModel(usageItems: UsageItem[]): Map<string, number> {
  const modelCounts = new Map<string, number>()
  for (const item of usageItems) {
    const model = item.model || 'Unknown'
    modelCounts.set(model, (modelCounts.get(model) || 0) + item.grossQuantity)
  }
  return modelCounts
}

function formatPercentage(percentage: number): string {
  if (percentage >= 1000) {
    return `${(percentage / 1000).toFixed(1)}k%`
  }
  return `${percentage.toFixed(1)}%`
}

function drawBar(used: number, total: number, width: number): string {
  const maxxed = Math.min(used, total)
  const filled = Math.floor((maxxed * width) / total)
  const empty = width - filled
  const percentage = (used / total) * 100
  
  let colorCode = '\x1b[32m'
  if (percentage >= 90) colorCode = '\x1b[31m'
  else if (percentage >= 75) colorCode = '\x1b[33m'
  
  const filledBar = colorCode + '█'.repeat(filled) + '\x1b[0m'
  const emptyBar = '\x1b[2m' + '░'.repeat(empty) + '\x1b[0m'
    
  return filledBar + emptyBar
}

async function main(): Promise<void> {
  const args = parseCliArgs()
  const plan = getPlan(args.plan)
  const limit = getLimit(args.limit, plan)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthName = now.toLocaleString('en-US', { month: 'long' })

  const username = await getUsername()
  const usage = await fetchUsage(username, year, month)

  const totalUsage = calculateTotalUsage(usage.usageItems || [])
  const percentage = (totalUsage / limit) * 100
  const modelCounts = aggregateByModel(usage.usageItems || [])

  if (args.json) {
    console.log(JSON.stringify({
      username,
      plan,
      limit,
      used: totalUsage,
      percentage: percentage.toFixed(1),
      month: `${monthName} ${year}`,
      models: Object.fromEntries(modelCounts),
    }, null, 2))
    return
  }

  const boxWidth = 60
  const innerWidth = boxWidth - 4

  console.log('\x1b[2m┌' + '─'.repeat(boxWidth - 2) + '┐\x1b[0m')
  console.log('\x1b[2m│\x1b[0m' + ' '.repeat(innerWidth) + '\x1b[2m│\x1b[0m')
  
  const title = `GitHub Copilot ${plan.charAt(0).toUpperCase() + plan.slice(1)} - Premium Requests`
  const titlePadding = Math.floor((innerWidth - title.length) / 2)
  console.log('\x1b[2m│\x1b[0m' + ' '.repeat(titlePadding) + title + ' '.repeat(innerWidth - title.length - titlePadding) + '\x1b[2m│\x1b[0m')
  
  const dateLine = `${monthName} ${year} • ${username}`
  const datePadding = Math.floor((innerWidth - dateLine.length) / 2)
  console.log('\x1b[2m│\x1b[0m' + ' '.repeat(datePadding) + dateLine + ' '.repeat(innerWidth - dateLine.length - datePadding) + '\x1b[2m│\x1b[0m')
  
  console.log('\x1b[2m│\x1b[0m' + ' '.repeat(innerWidth) + '\x1b[2m│\x1b[0m')
  console.log('\x1b[2m├' + '─'.repeat(boxWidth - 2) + '┤\x1b[0m')

  // Overall usage
  const usageLine = `Overall:  \x1b[1m${Math.round(totalUsage)}\x1b[0m\x1b[2m/${limit} (\x1b[0m${percentage >= 90 ? '\x1b[31m' : percentage >= 75 ? '\x1b[33m' : '\x1b[32m'}\x1b[1m${formatPercentage(percentage)}\x1b[0m\x1b[2m)\x1b[0m`
  console.log('\x1b[2m│\x1b[0m ' + usageLine + ' '.repeat(Math.max(0, innerWidth - usageLine.replace(/\x1b\[\d+m/g, '').length - 1)) + '\x1b[2m│\x1b[0m')
  const bar = drawBar(totalUsage, limit, innerWidth - 8)
  console.log('\x1b[2m│\x1b[0m Usage:  ' + bar + '\x1b[2m│\x1b[0m')

  console.log('\x1b[2m│\x1b[0m' + ' '.repeat(innerWidth) + '\x1b[2m│\x1b[0m')
  const nextMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2
  const nextYear = now.getMonth() === 11 ? year + 1 : year
  const nextMonthName = new Date(nextYear, nextMonth - 1, 1).toLocaleString('en-US', { month: 'long' })
  const resetLine = `Resets: ${nextMonthName} 1, ${nextYear} at 00:00 UTC`
  console.log('\x1b[2m│\x1b[0m ' + resetLine + ' '.repeat(innerWidth - resetLine.length - 1) + '\x1b[2m│\x1b[0m')

  console.log('\x1b[2m├' + '─'.repeat(boxWidth - 2) + '┤\x1b[0m')
  console.log('\x1b[2m│\x1b[0m \x1b[2mPer-model usage:\x1b[0m' + ' '.repeat(innerWidth - 16) + '\x1b[2m│\x1b[0m')
  console.log('\x1b[2m│\x1b[0m' + ' '.repeat(innerWidth) + '\x1b[2m│\x1b[0m')

  if (modelCounts.size === 0) {
    console.log('\x1b[2m│\x1b[0m No premium requests used yet.' + ' '.repeat(innerWidth - 33) + '\x1b[2m│\x1b[0m')
  } else {
    const sortedModels = Array.from(modelCounts.entries()).sort((a, b) => b[1] - a[1])
    for (const [model, count] of sortedModels) {
      if (count === 0) continue
      const modelPct = (count / limit) * 100
      const modelLine = `${model.padEnd(22)}${Math.round(count).toString().padStart(5)} ${formatPercentage(modelPct).padStart(7)}`
      console.log('\x1b[2m│\x1b[0m ' + modelLine + ' '.repeat(Math.max(0, innerWidth - modelLine.length - 1)) + '\x1b[2m│\x1b[0m')
    }
  }

  console.log('\x1b[2m│\x1b[0m' + ' '.repeat(innerWidth) + '\x1b[2m│\x1b[0m')
  console.log('\x1b[2m└' + '─'.repeat(boxWidth - 2) + '┘\x1b[0m')
}

main().catch(console.error)
