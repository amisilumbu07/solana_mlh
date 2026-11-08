# Supported LLM Providers

The agent middleware supports multiple LLM providers for trade analysis. Choose based on your needs, cost, and infrastructure.

## Quick Comparison

| Provider | Cost | Speed | Quality | Setup | Local | API Key |
|----------|------|-------|---------|-------|-------|---------|
| **Claude** | Paid | Fast | Excellent | Easy | ❌ | Required |
| **OpenAI** | Paid | Fast | Excellent | Easy | ❌ | Required |
| **Ollama** | Free | Medium | Good | Hard | ✅ | ❌ |
| **GPT4Free** | Free | Variable | Fair | Medium | ✅ | ❌ |
| **Custom** | Varies | Varies | Varies | Hard | Optional | Optional |

---

## 1. Claude (Anthropic) - Recommended Default

**Best for**: Production, reliability, latest models

### Setup

```bash
# 1. Get API key
# Visit: https://console.anthropic.com
# Sign up and create an API key (free tier: $5 credit)

# 2. Configure
cd bot-agent
cat > .env << EOF
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
LLM_MODEL=claude-3-5-sonnet-20241022
EOF

# 3. Start agent
npm run dev
```

### Pricing

- Input: $3 per 1M tokens
- Output: $15 per 1M tokens
- Free tier: $5 credit (≈1.6M input tokens)

### Models Available

- `claude-3-5-sonnet-20241022` - Fast, good quality (recommended)
- `claude-3-opus-20240229` - More capable, slower
- `claude-3-haiku-20240307` - Faster, less capable

---

## 2. OpenAI (GPT-4)

**Best for**: Familiar API, ChatGPT-like experience

### Setup

```bash
# 1. Get API key
# Visit: https://platform.openai.com/api-keys
# Create project + API key (requires credit card)

# 2. Configure
cd bot-agent
cat > .env << EOF
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
LLM_MODEL=gpt-4
EOF

# 3. Start agent
npm run dev
```

### Pricing

- GPT-4 Turbo: $10/$30 per 1M input/output tokens
- GPT-4: $30/$60 per 1M input/output tokens
- GPT-3.5 Turbo: $0.50/$1.50 per 1M tokens (cheaper option)

### Models Available

- `gpt-4` - Latest, most capable
- `gpt-4-turbo` - Faster than GPT-4
- `gpt-3.5-turbo` - Cheaper, still good for trade analysis

---

## 3. Ollama - Local & Free

**Best for**: Privacy, offline operation, cost savings

### Setup

#### Step 1: Install Ollama

```bash
# macOS/Linux
curl https://ollama.ai/install.sh | sh

# Or download: https://ollama.ai
```

#### Step 2: Download a Model

```bash
# Download Mistral (7B, fast and capable)
ollama pull mistral

# Or try other models:
# ollama pull neural-chat      # Optimized for chat
# ollama pull llama2           # Meta's LLaMA 2
# ollama pull dolphin-mixtral  # Uncensored model
# ollama pull orca-mini        # Smaller, fast
```

#### Step 3: Start Ollama

```bash
# In a separate terminal, start the Ollama server
ollama serve

# Output: Listening on 127.0.0.1:11434
```

#### Step 4: Configure Agent

```bash
cd bot-agent
cat > .env << EOF
LLM_PROVIDER=ollama
OLLAMA_ENDPOINT=http://localhost:11434
LLM_MODEL=mistral
EOF

npm run dev
```

### Pros & Cons

**Pros:**
- ✅ Completely free
- ✅ Runs locally (no API calls)
- ✅ Private - data never leaves your machine
- ✅ No rate limits
- ✅ Works offline

**Cons:**
- ❌ Requires local GPU or CPU (slower)
- ❌ Models less capable than Claude/GPT-4
- ❌ Setup complexity
- ❌ Higher latency (1-5 seconds vs 0.5-2 seconds)

### Recommended Ollama Models for Trading

- **Mistral** (7B): Best balance, ~3GB VRAM
- **Neural-Chat** (7B): Optimized for chat, ~4GB VRAM
- **Orca-Mini** (3B): Fast, low-resource, ~2GB VRAM
- **Dolphin-Mixtral** (8x7B): Most capable, requires 20GB+ VRAM

---

## 4. GPT4Free - Community Models (Free)

**Best for**: Learning, no budget, trying different models

### Setup

#### Step 1: Install GPT4Free

```bash
pip install g4f

# Or with poetry
poetry add g4f
```

#### Step 2: Start G4F Backend

```bash
# Start the FastAPI backend on port 8000
python -m g4f.api

# Output: Uvicorn running on http://127.0.0.1:8000
```

#### Step 3: Configure Agent

```bash
cd bot-agent
cat > .env << EOF
LLM_PROVIDER=gpt4free
LLM_ENDPOINT=http://localhost:8000
LLM_MODEL=gpt-4
EOF

npm run dev
```

### Available Models (via GPT4Free)

- `gpt-4` - OpenAI (free tier)
- `gpt-3.5-turbo` - OpenAI (free tier)
- `claude-3-opus` - Anthropic (limited)
- `mistral` - Open source
- `mixtral` - Open source (8x7B)

### Pros & Cons

**Pros:**
- ✅ Completely free
- ✅ Access to GPT-4 without paying
- ✅ Multiple model options
- ✅ No API key required

**Cons:**
- ❌ Unreliable (free tiers can be rate-limited)
- ❌ Slow (1-10+ seconds)
- ❌ No guaranteed uptime
- ❌ May stop working if free tiers close
- ⚠️ Legal gray area (reverse engineering APIs)

---

## 5. Custom Endpoint

**Best for**: Self-hosted models, private infrastructure

### Setup

```bash
# Configure your custom endpoint
cd bot-agent
cat > .env << EOF
LLM_PROVIDER=custom
LLM_ENDPOINT=http://your-server.com:8000/api/chat
LLM_API_KEY=your_api_key_if_needed
LLM_MODEL=your-model-name
EOF

npm run dev
```

### Example: LM Studio (Local)

```bash
# 1. Download LM Studio: https://lmstudio.ai
# 2. Load a model and start server (default port 1234)
# 3. Configure:
LLM_PROVIDER=custom
LLM_ENDPOINT=http://localhost:1234/v1/chat/completions
LLM_MODEL=local-model

npm run dev
```

---

## Switching Providers

### Change Provider Dynamically

```bash
# Edit .env and restart
vi bot-agent/.env

# Update LLM_PROVIDER to your choice
LLM_PROVIDER=openai

# Restart agent
npm run dev
```

### Runtime API Call (via Dashboard)

```bash
# Update risk config endpoint supports LLM changes (Phase 3)
curl -X POST http://localhost:3001/api/llm-config \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-4-turbo",
    "apiKey": "sk-proj-..."
  }'
```

---

## Cost Analysis

### Monthly Estimate (1000 trades/day, 2 months)

**Claude (Recommended)**
- ~60K trades/month
- Avg 500 input + 300 output tokens per trade
- Cost: (30M × $0.003) + (18M × $0.015) = **$360/month**

**OpenAI GPT-4**
- Same volume
- Cost: (30M × $0.03) + (18M × $0.06) = **$2,070/month**

**OpenAI GPT-3.5-Turbo** (Cheaper)
- Same volume
- Cost: (30M × $0.0005) + (18M × $0.0015) = **$42/month**

**Ollama/GPT4Free**
- **$0/month** (electricity only)

---

## Performance Comparison

### Latency (from trade to signal)

| Provider | Analysis Time | Total E2E |
|----------|---------------|-----------|
| Claude | 0.8-1.5s | 1.3-2.0s |
| OpenAI | 1.0-2.0s | 1.5-2.5s |
| Ollama (GPU) | 2-5s | 2.5-5.5s |
| Ollama (CPU) | 10-30s | 10.5-30.5s |
| GPT4Free | 2-10s | 2.5-10.5s |

---

## Recommendation

**For Production:**
→ Use **Claude** (reliable, fast, good pricing)

**For Cost-Conscious:**
→ Use **Ollama** locally (free, private)

**For Learning/Testing:**
→ Use **GPT4Free** (free, easy to try)

**For Experimentation:**
→ Set up **Custom endpoint** with your infrastructure

---

## Troubleshooting

### "Provider not initialized" error

```bash
# Check environment variables are loaded
env | grep LLM_

# Verify API key format
# Claude: starts with sk-ant-
# OpenAI: starts with sk-proj-

# Restart agent
npm run dev
```

### Slow analysis (>3 seconds)

- **Ollama/Local?** → Check GPU availability
- **GPT4Free?** → Check endpoint health, try different model
- **Claude/OpenAI?** → May be API rate limiting

### "Failed to connect to LLM"

- **Ollama?** → Ensure running: `ollama serve`
- **GPT4Free?** → Ensure running: `python -m g4f.api`
- **Claude/OpenAI?** → Check API key and internet connection

### Poor quality responses

- Try a more capable model (e.g., Claude Opus vs Sonnet)
- Increase temperature in `.env` for more creativity
- Increase max_tokens for longer reasoning
- Try a different provider

---

## Next: Use in Agent

Once configured, the agent automatically uses your chosen provider for all trade analysis! 🚀
