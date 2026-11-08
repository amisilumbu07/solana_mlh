import axios from 'axios'

export interface BookSnapshot {
  bestBid: number | null
  bestAsk: number | null
  askDepthUsdc: number
}

export async function fetchBook(clobUrl: string, tokenId: string): Promise<BookSnapshot> {
  const { data } = await axios.get(`${clobUrl}/book`, { params: { token_id: tokenId }, timeout: 5000 })
  const levels = (side: any[] | undefined) =>
    (side ?? []).map((level) => ({ price: Number(level.price), size: Number(level.size) }))
  const bids = levels(data?.bids)
  const asks = levels(data?.asks)
  return {
    bestBid: bids.length ? Math.max(...bids.map((l) => l.price)) : null,
    bestAsk: asks.length ? Math.min(...asks.map((l) => l.price)) : null,
    askDepthUsdc: asks.reduce((sum, l) => sum + l.price * l.size, 0),
  }
}
