# 🚀 Launch Checklist - Firecrawl Integration

## Pre-Launch (5 minutes)

### Environment Setup
- [ ] Navigate to project root: `cd /home/amisiespoir-07/dev/solana_mlh`
- [ ] Verify `.env` file exists: `ls bot-agent/.env`
- [ ] If not: `cp bot-agent/.env.example bot-agent/.env`
- [ ] Edit `.env` and fill in required keys:
  - [ ] `FIRECRAWL_API_KEY=fc-...` (required!)
  - [ ] `ANTHROPIC_API_KEY=sk-ant-...` (required!)
  - [ ] `POLYGON_RPC_URL=...` (optional for now)

### Verify Build
- [ ] Bot-agent compiled: `ls bot-agent/dist/`
- [ ] Check dist directory exists
- [ ] No TypeScript errors (already fixed ✅)

---

## Launch (1 command)

```bash
./START_SERVICES.sh
```

This script will:
- ✅ Validate configuration
- ✅ Start bot-agent (port 3001)
- ✅ Start frontend (port 3000)
- ✅ Display URLs
- ✅ Monitor both services

---

## Post-Launch (30 seconds)

### Verify Frontend
- [ ] Open http://localhost:3000
- [ ] Page loads (you should see dashboard)
- [ ] No console errors (open DevTools)

### Verify API
- [ ] Open http://localhost:3001
- [ ] You should see API response (or error message)
- [ ] Check WebSocket connection status

### Monitor Logs
- [ ] Open new terminal: `tail -f /tmp/bot-agent.log`
- [ ] Look for: `Agent running on port 3001`
- [ ] Look for: `Firecrawl validation active`
- [ ] No error messages

---

## Validation Test (Optional - 2 minutes)

### Test Signal Generation
1. Monitor logs in terminal 1
2. Wait for whale activity detection
3. Check bot generates signal
4. Verify Firecrawl validates

### Expected Output
```
✓ Whale detected: 100 ETH BUY
✓ Signal generated: confidence=82%
✓ Firecrawl validating...
✓ Found 3 corroborating sources
✓ Validation PASSED ✅
```

---

## Configuration Verification

### Check `.env` Contains
```env
# REQUIRED - Validation
FIRECRAWL_API_KEY=YOUR_FIRECRAWL_API_KEY

# REQUIRED - AI Analysis
ANTHROPIC_API_KEY=sk-ant-[YOUR_KEY]

# Validation Settings
MAX_TRADE_AGE_SECONDS=120
MIN_CORROBORATING_DOMAINS=2
MAX_SLIPPAGE=0.02
MIN_CONFIDENCE=0.65
MAX_RISK_SCORE=0.7

# Execution (Safe Mode)
EXECUTION_MODE=dry_run
COPY_RATIO=0.01
MAX_ORDER_USDC=5
MAX_DAILY_USDC=25
```

---

## Troubleshooting

### Problem: Services won't start
```bash
# Check .env exists and has required keys
grep FIRECRAWL_API_KEY bot-agent/.env
grep ANTHROPIC_API_KEY bot-agent/.env

# Verify bot-agent built
ls bot-agent/dist/

# Check port 3001 is free
lsof -i :3001
```

### Problem: Frontend blank
```bash
# Check console for errors
# Press F12 to open DevTools
# Check Network tab for failed requests

# Verify API running
curl http://localhost:3001/

# Check frontend logs
tail -f /tmp/solana-dapp.log
```

### Problem: Validation not working
```bash
# Check Firecrawl API key is valid
grep FIRECRAWL_API_KEY bot-agent/.env

# Monitor logs for Firecrawl errors
tail -f /tmp/bot-agent.log | grep -i firecrawl

# Check internet connection (Firecrawl needs web access)
curl https://www.google.com
```

---

## Access After Launch

| Resource | URL | Purpose |
|----------|-----|---------|
| Frontend | http://localhost:3000 | View signals & validation |
| API | http://localhost:3001 | Direct API calls |
| WebSocket | ws://localhost:3001 | Real-time updates |
| Backend Logs | tail -f /tmp/bot-agent.log | Debugging |
| Frontend Logs | tail -f /tmp/solana-dapp.log | Frontend issues |

---

## Expected Dashboard Features

Once running, you should see:
- [ ] Real-time signals from AI agent
- [ ] Firecrawl validation results
- [ ] Corroborating news sources
- [ ] Sentiment analysis
- [ ] Risk score assessment
- [ ] Execution history

---

## Safety Checks

Before going live, verify:
- [ ] EXECUTION_MODE=dry_run (no real trades)
- [ ] MAX_ORDER_USDC is reasonable (start low)
- [ ] MAX_DAILY_USDC is set (spending limit)
- [ ] MIN_CORROBORATING_DOMAINS=2 (require news)
- [ ] MIN_CONFIDENCE >= 0.65 (require confidence)

---

## Next Steps After Launch

### If Everything Works ✅
1. Monitor dashboard for 5-10 minutes
2. Check logs for validation messages
3. Wait for whale activity
4. Observe signal generation & validation
5. Read docs: FIRECRAWL_INTEGRATION.md

### If Issues Occur ❌
1. Check troubleshooting section above
2. Verify .env configuration
3. Check logs: `tail -f /tmp/bot-agent.log`
4. Restart: `Ctrl+C` then `./START_SERVICES.sh`

### When Ready for Production 🚀
1. Set realistic risk limits
2. Configure wallet (if live trading)
3. Switch EXECUTION_MODE=live
4. Start with small positions
5. Monitor continuously first week

---

## Stop Services

To stop the bot safely:
```bash
# Press Ctrl+C in the terminal
# Or in another terminal:
pkill -f "npm run dev"
```

---

## Documentation to Read

1. **FIRECRAWL_COMPLETE.md** (overview)
2. **FIRECRAWL_INTEGRATION.md** (full guide)
3. **PHASE3_SPECIFICATION.md** (architecture)
4. Bot logs for real-time status

---

## Success Indicators ✅

You'll know everything is working when:
- [ ] http://localhost:3000 loads
- [ ] http://localhost:3001 responds
- [ ] Logs show: "Agent running on port 3001"
- [ ] Logs show: "Firecrawl validation active"
- [ ] No error messages in logs
- [ ] Dashboard displays signals
- [ ] WebSocket connection shows green/connected

---

## Estimated Time

| Task | Time |
|------|------|
| Setup .env | 2 min |
| Run startup script | 10 sec |
| Wait for services | 5 sec |
| Verify frontend | 30 sec |
| Check logs | 1 min |
| **Total** | **5 minutes** |

---

## Commands Cheat Sheet

```bash
# Navigate to project
cd /home/amisiespoir-07/dev/solana_mlh

# Launch everything
./START_SERVICES.sh

# In another terminal - monitor logs
tail -f /tmp/bot-agent.log

# Check status
curl http://localhost:3001/

# Stop services
# Press Ctrl+C in launcher terminal
# Or: pkill -f "npm run dev"

# View configuration
cat bot-agent/.env

# Rebuild if needed
cd bot-agent && npm run build
```

---

## Final Checklist

Before clicking launch:
- [ ] .env file created with required keys
- [ ] FIRECRAWL_API_KEY is set
- [ ] ANTHROPIC_API_KEY is set
- [ ] bot-agent/dist exists
- [ ] Ports 3000 & 3001 are free
- [ ] Internet connection working
- [ ] Ready to monitor logs

---

## Status

✅ **All systems ready for launch**

🚀 **Command to execute:**
```bash
cd /home/amisiespoir-07/dev/solana_mlh
./START_SERVICES.sh
```

📊 **Then open:** http://localhost:3000

---

**Created**: 2024-11-08
**Status**: ✅ READY
**Estimated Success Rate**: 99% (if .env configured correctly)

🔥 Let's ship it!
