export const RADAR_PRESETS = [
  {
    id: "ai-seed",
    label: "AI Seed / Series A",
    description: "Google News RSS for AI startups raising Seed and Series A rounds",
    url: "https://news.google.com/rss/search?q=seed+OR+%22series+A%22+startup+funding+AI&hl=en-US&gl=US&ceid=US:en",
  },
  {
    id: "techcrunch",
    label: "TechCrunch Venture",
    description: "Latest venture capital and startup investments from TechCrunch",
    url: "https://techcrunch.com/category/venture/feed/",
  },
  {
    id: "inc42",
    label: "India Startups (Inc42)",
    description: "Indian startup ecosystem funding rounds and angel investments",
    url: "https://news.google.com/rss/search?q=startup+funding+India+seed+OR+series+OR+Inc42&hl=en-IN&gl=IN&ceid=IN:en",
  },
  {
    id: "yc-launches",
    label: "YC Launches",
    description: "Y Combinator launch announcements and recent seed raises",
    url: "https://news.google.com/rss/search?q=%22Y+Combinator%22+raises+OR+funding+OR+launches&hl=en-US&gl=US&ceid=US:en",
  },
] as const

export type RadarPresetId = (typeof RADAR_PRESETS)[number]["id"]
