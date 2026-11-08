# Multi-LLM Provider Integration Guide

The agent now supports 5 different LLM providers for flexible trade analysis. Choose based on cost, privacy, and performance needs.

## Supported Providers

1. **Claude** (Anthropic) - Default
2. **OpenAI** (GPT-4 family)
3. **Ollama** (Local inference)
4. **GPT4Free** (Free community models)
5. **Custom** (Your own endpoint)

---

## Quick Start with Each Provider

### Provider 1: Claude (Recommended)

```bash
cd bot-agent
cp .env.example .env

# Edit .env
cat >> .env << 'EOF'
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-YOUR_API_KEY
LLM_MODEL=claude-3-5-sonnet-20241022
EOF

npm run dev
```

**Get API Key:**
1. Visit https://console.anthropic.com
2. Sign up (free tier: $5 credit)
3. Create API key
4. Paste into .env

---

### Provider 2: OpenAI

```bash
cd bot-agent

cat >> .env << 'EOF'
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-YOUR_API_KEY
LLM_MODEL=gpt-4
# Or cheaper: gpt-3.5-turbo
EOF

npm run dev
```

**Get API Key:**
1. Visit https://platform.openai.com/api-keys
2. Create project and API key
3. Add payment method
4. Paste into .env

---

### Provider 3: Ollama (Free, Local)

```bash
# Step 1: Install Ollama
curl https://ollama.ai/install.sh | sh
# Or download from https://ollama.ai

# Step 2: Download a model (in separate terminal)
ollama pull mistral
# Other options: neural-chat, llama2, orca-mini

# Step 3: Start Ollama server (keep running)
ollama serve

# Step 4: Configure agent (in another terminal)
cd bot-agent

cat >> .env << 'EOF'
LLM_PROVIDER=ollama
OLLAMA_ENDPOINT=http://localhost:11434
LLM_MODEL=mistral
EOF

npm run dev
```

**Best Models for Trading:**
- `mistral` (7B) - Fast, good quality
- `neural-chat` (7B) - Optimized for chat
- `orca-mini` (3B) - Lightweight
- `dolphin-mixtral` (8x7B) - Most capable (requires 20GB VRAM)

---

### Provider 4: GPT4Free (Free, Via API)

```bash
# Step 1: Install GPT4Free
pip install g4f

# Step 2: Start G4F backend (in separate terminal)
python -m g4f.api
# Runs on http://localhost:8000

# Step 3: Configure agent
cd bot-agent

cat >> .env << 'EOF'
LLM_PROVIDER=gpt4free
LLM_ENDPOINT=http://localhost:8000
LLM_MODEL=gpt-4
EOF

npm run dev
```

**Available Models via GPT4Free:**
- gpt-4
- gpt-3.5-turbo
- claude (limited)
- mistral
- mixtral

---

### Provider 5: Custom Endpoint

For self-hosted models or private infrastructure:

```bash
cd bot-agent

cat >> .env << 'EOF'
LLM_PROVIDER=custom
LLM_ENDPOINT=http://your-server.com:8000/api/chat
LLM_API_KEY=optional_api_key
LLM_MODEL=your-model-name
EOF

npm run dev
```

**Example: LM Studio (Local GUI)**
1. Download https://lmstudio.ai
2. Load a model
3. Start local server (port 1234)
4. Configure:
```bash
LLM_PROVIDER=custom
LLM_ENDPOINT=http://localhost:1234/v1/chat/completions
```

---

## Configuration Reference

### Environment Variables

```env
# Provider selection (required)
LLM_PROVIDER=claude|openai|ollama|gpt4free|custom

# Model name (optional, uses provider default if not set)
LLM_MODEL=claude-3-5-sonnet-20241022

# API Keys (depends on provider)
ANTHROPIC_API_KEY=sk-ant-...          # For Claude
OPENAI_API_KEY=sk-proj-...            # For OpenAI
LLM_API_KEY=...                        # For custom endpoints

# Endpoints (depends on provider)
OLLAMA_ENDPOINT=http://localhost:11434  # For Ollama
LLM_ENDPOINT=http://...                # For custom/GPT4Free

# Optional tuning
LLM_TEMPERATURE=0.7        # Creativity (0=deterministic, 1=random)
LLM_MAX_TOKENS=1024        # Max response length
```

---

## Architecture

```
┌─────────────────────────────────┐
│  Agent Service                  │
│  (analyzeTradeSignal)           │
└──────────────┬──────────────────┘
               │ Reads LLM_PROVIDER
               ▼
┌─────────────────────────────────┐
│  Multi-LLM Adapter              │
│  ├─ Claude Handler              │
│  ├─ OpenAI Handler              │
│  ├─ Ollama Handler              │
│  ├─ GPT4Free Handler            │
│  └─ Custom Handler              │
└──────────────┬──────────────────┘
               │
        ┌──────┼──────────┬─────────┬─────────┐
        ▼      ▼          ▼         ▼         ▼
      Claude OpenAI    Ollama  GPT4Free  Custom
      API    API       (Local) (Free)    Server
```

---

## Usage in Code

### AgentService Now Auto-Routes

```typescript
// Agent automatically detects and uses configured provider
const agentService = new AgentService()

const signal = await agentService.analyzeTradeSignal({
  transaction: {...},
  market: 'BTC_USD_2024Q4',
  whaleAddress: '0x...',
  timestamp: new Date().toISOString()
})

// Returns TradeSignal regardless of which provider was used
console.log(signal)
```

### MultiLLMAdapter Usage (Direct)

```typescript
import { createLLMAdapter } from './services/multiLLMAdapter'

// Auto-detect from .env
const adapter = createLLMAdapter()

const response = await adapter.sendMessage(
  'Analyze this trade: ...'
)

console.log(response.text)
console.log(response.provider)        // 'claude'
console.log(response.tokensUsed)      // { input: 234, output: 156 }
```

---

## Cost Comparison (Monthly)

Assuming 1000 trades/day (60K/month), avg 500 input + 300 output tokens:

| Provider | Cost/Month | Speed | Quality |
|----------|-----------|-------|---------|
| Claude | $360 | ⚡ Fast | ⭐⭐⭐⭐⭐ |
| OpenAI GPT-4 | $2,070 | ⚡ Fast | ⭐⭐⭐⭐⭐ |
| OpenAI GPT-3.5 | $42 | ⚡⚡ Very Fast | ⭐⭐⭐⭐ |
| Ollama | $0* | ⚠️ Slow | ⭐⭐⭐ |
| GPT4Free | $0 | ⚠️⚠️ Very Slow | ⭐⭐⭐ |
| Custom | Varies | Varies | Varies |

*Ollama costs only electricity (~$10-50/month depending on GPU)

---

## Latency Comparison

From trade detection to dashboard signal:

| Provider | Analysis Time | Total E2E |
|----------|---------------|-----------|
| Claude | 0.8-1.5s | 1.3-2.0s ✅ |
| OpenAI | 1.0-2.0s | 1.5-2.5s ✅ |
| Ollama (GPU) | 2-5s | 2.5-5.5s |
| Ollama (CPU) | 10-30s | 10.5-30.5s |
| GPT4Free | 2-10s | 2.5-10.5s |

---

## Switching Providers

### Option 1: Update .env and Restart

```bash
# Edit .env
vi bot-agent/.env

# Change provider
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-...

# Restart agent
npm run dev
```

### Option 2: Programmatic Switch (Phase 3)

Will support runtime provider switching via API:

```bash
# Future endpoint
POST /api/llm-config
{
  "provider": "openai",
  "model": "gpt-4-turbo",
  "apiKey": "sk-proj-..."
}
```

---

## Recommendations

### Best for Each Use Case

**Production Trading:**
→ Claude (reliable, consistent, good cost/performance)

**Cost-Conscious:**
→ Ollama locally (free, private)

**Maximum Capability:**
→ OpenAI GPT-4 (most advanced)

**Learning/Experimentation:**
→ GPT4Free (free, easy to try)

**Private/Sensitive Data:**
→ Ollama or Custom (on-premise)

---

## Troubleshooting

### "LLM_PROVIDER not found"
```bash
# .env not loaded
source bot-agent/.env
echo $LLM_PROVIDER

# Restart with explicit env
cd bot-agent
npm run dev
```

### "API key invalid"
```bash
# Check key format:
# Claude: sk-ant-...
# OpenAI: sk-proj-...

# Verify in .env:
grep ANTHROPIC_API_KEY .env
grep OPENAI_API_KEY .env
```

### "Connection refused" (Ollama/GPT4Free)
```bash
# Ensure services are running:
# Terminal 1: ollama serve
# Terminal 2: python -m g4f.api

# Check ports:
curl http://localhost:11434  # Ollama
curl http://localhost:8000   # GPT4Free
```

### Slow responses
```bash
# Check LLM model size
ollama list

# For faster response with Ollama:
ollama pull orca-mini  # Smaller model
```

### High latency (>5 seconds)
- Consider upgrading provider (Claude/OpenAI)
- Or use faster local model (orca-mini)
- Or increase max_tokens for trade-offs

---

## Advanced Configuration

### Custom Prompts

Edit `/src/services/agentService.ts` `analyzeTradeSignal()` method to customize the analysis prompt for different providers.

### Temperature Tuning

```env
# More deterministic (analytical)
LLM_TEMPERATURE=0.3

# Balanced
LLM_TEMPERATURE=0.7

# More creative (risky)
LLM_TEMPERATURE=0.9
```

### Token Limits

```env
# Shorter responses (faster)
LLM_MAX_TOKENS=512

# Default
LLM_MAX_TOKENS=1024

# Very detailed (slower, costs more)
LLM_MAX_TOKENS=2048
```

---

## Next Steps

1. Choose a provider above
2. Set up API key or local service
3. Update `.env` with provider config
4. Restart agent: `npm run dev`
5. Check logs for provider initialization
6. Open dashboard and monitor trades!

**Happy analyzing! 🚀**
