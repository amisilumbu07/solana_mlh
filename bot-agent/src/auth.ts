import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { decodePaymentSignatureHeader } from '@x402/core/http'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { paymentMiddleware, x402ResourceServer } from '@x402/express'
import type { AppConfig } from './config.js'

export type Scope = 'analyze' | 'config:write' | 'trade:execute'

export interface SessionClaims {
  jti: string
  sub: string
  scopes: Scope[]
  exp: number
}

const encode = (value: Buffer | string) => Buffer.from(value).toString('base64url')

export class SessionTokens {
  private secret: Buffer
  private analysisCounts = new Map<string, number>()

  constructor(
    secret: string,
    private ttlSeconds: number,
    private maxAnalyses: number,
  ) {
    if (secret && secret.length < 32) throw new Error('AGENT_SESSION_SECRET must be at least 32 characters')
    // With no configured secret, tokens simply stop working when the agent restarts.
    this.secret = secret ? Buffer.from(secret) : randomBytes(48)
  }

  private sign(payload: string): Buffer {
    return createHmac('sha256', this.secret).update(payload).digest()
  }

  issue(sub: string, scopes: Scope[], ttlSeconds = this.ttlSeconds) {
    const claims: SessionClaims = { jti: randomUUID(), sub, scopes, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
    const payload = encode(JSON.stringify(claims))
    return { token: `${payload}.${encode(this.sign(payload))}`, expiresAt: claims.exp, scopes }
  }

  verify(token: string): SessionClaims | null {
    const [payload, signature, extra] = token.split('.')
    if (!payload || !signature || extra !== undefined) return null
    const expected = this.sign(payload)
    const actual = Buffer.from(signature, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionClaims
      return claims.exp > Date.now() / 1000 ? claims : null
    } catch {
      return null
    }
  }

  /** A session costs cents but each analysis spends LLM and scraping credits, so uses are capped. */
  consumeAnalysis(claims: SessionClaims): boolean {
    const used = this.analysisCounts.get(claims.jti) ?? 0
    if (used >= this.maxAnalyses) return false
    this.analysisCounts.set(claims.jti, used + 1)
    return true
  }
}

export function requireScope(tokens: SessionTokens, scope: Scope): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? ''
    const claims = header.startsWith('Bearer ') ? tokens.verify(header.slice(7)) : null
    if (!claims) {
      res.status(401).json({ error: 'A valid session token is required' })
      return
    }
    if (!claims.scopes.includes(scope)) {
      res.status(403).json({ error: `This session lacks the ${scope} scope` })
      return
    }
    res.locals.session = claims
    next()
  }
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/**
 * Lets the local dashboard change risk settings with no key in frontend code. Browsers can't
 * forge Origin, and the loopback check blocks other machines. Behind a reverse proxy every
 * caller looks local, so don't expose this route that way.
 */
export function isLocalDashboard(req: Request, allowedOrigins: string[]): boolean {
  return LOOPBACK.has(req.socket.remoteAddress ?? '') && allowedOrigins.includes(req.headers.origin ?? '')
}

const fingerprint = (payload: unknown) => createHash('sha256').update(JSON.stringify(payload)).digest('hex')

export interface X402Gate {
  middleware: RequestHandler
  /** The facilitator-verified payer behind this request's payment, or null. */
  takePayer: (req: Request) => string | null
}

export function createX402Gate(config: AppConfig['x402']): X402Gate | null {
  if (!config.payTo) return null

  const network = config.network as `${string}:${string}`
  const verifiedPayers = new Map<string, string>()

  const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: config.facilitatorUrl }))
    .register(network, new ExactEvmScheme())
    .onAfterVerify(async ({ paymentPayload, result }) => {
      if (result.isValid && result.payer) {
        verifiedPayers.set(fingerprint(paymentPayload.payload), result.payer)
      }
    })

  const middleware = paymentMiddleware(
    {
      'POST /api/session': {
        accepts: { scheme: 'exact', price: config.price, network, payTo: config.payTo },
        description: 'Short-lived agent session token',
        mimeType: 'application/json',
      },
    },
    server,
  )

  return {
    middleware,
    takePayer: (req) => {
      const header = req.headers['payment-signature']
      if (typeof header !== 'string') return null
      const key = fingerprint(decodePaymentSignatureHeader(header).payload)
      const payer = verifiedPayers.get(key) ?? null
      verifiedPayers.delete(key)
      return payer
    },
  }
}
