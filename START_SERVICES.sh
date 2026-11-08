#!/bin/bash

# Start Services Script for Prediction Market Bot
# Runs bot-agent backend + solana-dapp frontend

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_AGENT_DIR="$PROJECT_ROOT/bot-agent"
SOLANA_DAPP_DIR="$PROJECT_ROOT/solana-dapp"

echo "🚀 Starting Prediction Market Bot with Firecrawl Integration"
echo "=================================================="
echo ""

# Check if .env exists in bot-agent
if [ ! -f "$BOT_AGENT_DIR/.env" ]; then
    echo "⚠️  Warning: .env not found in bot-agent"
    echo "   Creating from .env.example..."
    cp "$BOT_AGENT_DIR/.env.example" "$BOT_AGENT_DIR/.env"
    echo "   ℹ️  Please edit $BOT_AGENT_DIR/.env and add:"
    echo "      - FIRECRAWL_API_KEY (required for validation loop)"
    echo "      - ANTHROPIC_API_KEY (required for agent)"
    echo "      - POLYMARKET_PRIVATE_KEY (if executing trades)"
    echo ""
fi

# Verify required environment variables
echo "📋 Checking configuration..."
if ! grep -q "FIRECRAWL_API_KEY" "$BOT_AGENT_DIR/.env"; then
    echo "❌ Error: FIRECRAWL_API_KEY not set in .env"
    exit 1
fi

echo "✅ Firecrawl API configured"

# Build bot-agent if dist doesn't exist
if [ ! -d "$BOT_AGENT_DIR/dist" ]; then
    echo ""
    echo "🔨 Building bot-agent..."
    cd "$BOT_AGENT_DIR"
    npm run build
    echo "✅ Bot-agent built successfully"
fi

# Start services in background
echo ""
echo "🌐 Starting services..."
echo ""

# Terminal 1: Bot Agent
echo "📡 Starting bot-agent (port 3001)..."
cd "$BOT_AGENT_DIR"
npm run dev > /tmp/bot-agent.log 2>&1 &
BOT_PID=$!
echo "   PID: $BOT_PID"

# Wait for bot-agent to start
sleep 3

# Check if bot-agent started
if ! ps -p $BOT_PID > /dev/null; then
    echo "❌ Bot-agent failed to start"
    echo "   Check logs: cat /tmp/bot-agent.log"
    exit 1
fi

# Terminal 2: Frontend
echo "🎨 Starting solana-dapp frontend (port 3000)..."
cd "$SOLANA_DAPP_DIR"
npm run dev > /tmp/solana-dapp.log 2>&1 &
FRONTEND_PID=$!
echo "   PID: $FRONTEND_PID"

# Wait for frontend to start
sleep 3

# Check if frontend started
if ! ps -p $FRONTEND_PID > /dev/null; then
    echo "❌ Frontend failed to start"
    echo "   Check logs: cat /tmp/solana-dapp.log"
    kill $BOT_PID
    exit 1
fi

echo ""
echo "=================================================="
echo "✅ All services started successfully!"
echo "=================================================="
echo ""
echo "📍 Access points:"
echo "   • Frontend:  http://localhost:3000"
echo "   • Bot API:   http://localhost:3001"
echo "   • WebSocket: ws://localhost:3001"
echo ""
echo "📊 With Firecrawl integration:"
echo "   • Real-time news validation"
echo "   • Multi-source corroboration (MIN_CORROBORATING_DOMAINS=2)"
echo "   • Trade age check (MAX_TRADE_AGE_SECONDS=120)"
echo ""
echo "📝 Logs:"
echo "   • Bot:      tail -f /tmp/bot-agent.log"
echo "   • Frontend: tail -f /tmp/solana-dapp.log"
echo ""
echo "⏹️  To stop services: press Ctrl+C"
echo ""

# Keep script running and handle signals
trap 'kill $BOT_PID $FRONTEND_PID 2>/dev/null; echo ""; echo "🛑 Services stopped"; exit 0' SIGINT SIGTERM

while true; do
    # Check if processes are still running
    if ! ps -p $BOT_PID > /dev/null; then
        echo "⚠️  Bot-agent crashed"
        kill $FRONTEND_PID 2>/dev/null
        exit 1
    fi
    if ! ps -p $FRONTEND_PID > /dev/null; then
        echo "⚠️  Frontend crashed"
        kill $BOT_PID 2>/dev/null
        exit 1
    fi
    sleep 5
done
