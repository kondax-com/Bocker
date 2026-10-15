import { afterEach, describe, expect, it, vi } from 'vitest'
import { LineService } from './LineService'

afterEach(() => vi.restoreAllMocks())

describe('LINE provider failure privacy', () => {
  it.each(['sendMessage', 'sendFlexMessage'] as const)(
    '%s does not expose provider credentials or message content',
    async (method) => {
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('provider rejected secret-token and private-recipient')
      const repository = {
        sendMessage: vi.fn().mockRejectedValue(error),
        sendFlexMessage: vi.fn().mockRejectedValue(error),
      }
      const service = new LineService(repository)
      const result =
        method === 'sendMessage'
          ? await service.sendMessage('private-recipient', 'private-content', 'secret-token')
          : await service.sendFlexMessage(
              'private-recipient',
              [{ type: 'text', text: 'private-content' }],
              'secret-token'
            )
      expect(result.success).toBe(false)
      const exposed = JSON.stringify([result, errorLog.mock.calls])
      expect(exposed).not.toContain('secret-token')
      expect(exposed).not.toContain('private-recipient')
      expect(exposed).not.toContain('private-content')
    }
  )
})
